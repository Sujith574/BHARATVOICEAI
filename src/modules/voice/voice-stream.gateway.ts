import { NotificationType } from "@prisma/client";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

import type { Logger } from "pino";
import { WebSocketServer, WebSocket } from "ws";

import type { AppConfig } from "../../config/env";
import { mediaStreamEventSchema, type MediaStreamEvent } from "./voice.schemas";
import type { CallSessionService } from "./call-session.service";
import type { GroundingEngine } from "../ai/grounding.engine";
import type { SpeechService } from "./speech.service";
import type { VoiceRepository } from "./voice.repository";
import { ConversationSpeakerRole } from "./voice.repository";
import type { NotificationService } from "../admin/notifications/notification.service";

interface ActiveStreamSession {
  callSid?: string;
  streamSid?: string;
  accountSid?: string;
  /** Database UUID resolved from the Call record after the stream starts. */
  callDbId?: string;
  mediaFrames: number;
  connectedAt: number;
  audioBuffers: Buffer[];
  isProcessing: boolean;
  /** Counter used to assign monotonically increasing turn indices for transcripts. */
  turnIndex: number;
  /** Flag indicating the assistant is currently speaking/playing back audio. */
  isPlayingAudio: boolean;
  /** Timeout tracking assistant audio playback duration. */
  playbackTimeout?: NodeJS.Timeout;
}

export class VoiceStreamGateway {
  private readonly webSocketServer = new WebSocketServer({ noServer: true });

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly callSessionService: CallSessionService,
    private readonly groundingEngine: GroundingEngine,
    private readonly speechService: SpeechService,
    private readonly voiceRepository: VoiceRepository,
    private readonly notificationService: NotificationService
  ) {}

  public attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      const url = this.getUrl(request);
      
      this.logger.info(
        {
          pathname: url.pathname,
          search: url.search,
          headers: request.headers
        },
        "Received WebSocket upgrade request"
      );

      if (url.pathname !== `${this.config.apiPrefix}/voice/media-stream`) {
        this.logger.warn({ pathname: url.pathname }, "WebSocket upgrade request pathname mismatch");
        return;
      }

      if (!this.isAuthorized(url, request)) {
        this.logger.warn(
          {
            enabled: this.config.twilioMediaStreamEnabled,
            hasSecret: !!this.config.twilioMediaStreamSecret,
            tokenParam: url.searchParams.get("token")
          },
          "WebSocket upgrade request unauthorized"
        );
        this.rejectUpgrade(socket, 401, "Unauthorized");
        return;
      }

      this.logger.info("WebSocket upgrade request authorized, handling upgrade");
      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.handleConnection(webSocket, request);
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.webSocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Decodes a single G.711 mu-law sample to a 16-bit linear PCM value (-8192 to 8192).
   */
  private decodeMuLawSample(byte: number): number {
    const mask = ~byte & 0xff;
    const sign = mask & 0x80 ? -1 : 1;
    const exponent = (mask >> 4) & 0x07;
    const mantissa = mask & 0x0f;
    return sign * ((1 << exponent) * (mantissa + 33) - 33);
  }

  /**
   * Evaluates the RMS energy of raw mu-law audio payload to detect user speech (VAD).
   */
  private isUserSpeaking(payloadBase64: string): boolean {
    const buffer = Buffer.from(payloadBase64, "base64");
    if (buffer.length === 0) return false;

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte !== undefined) {
        const sample = this.decodeMuLawSample(byte);
        sum += sample * sample;
      }
    }

    const rms = Math.sqrt(sum / buffer.length);
    // Return true if RMS energy exceeds speech energy threshold
    return rms > 1000;
  }

  private handleConnection(webSocket: WebSocket, request: IncomingMessage): void {
    const session: ActiveStreamSession = {
      mediaFrames: 0,
      connectedAt: Date.now(),
      audioBuffers: [],
      isProcessing: false,
      turnIndex: 0,
      isPlayingAudio: false,
    };

    const heartbeat = setInterval(() => {
      if (webSocket.readyState === webSocket.OPEN) {
        webSocket.ping();
      }
    }, this.config.wsHeartbeatIntervalMs);

    webSocket.on("message", (rawMessage) => {
      try {
        const payloadText =
          typeof rawMessage === "string"
            ? rawMessage
            : Buffer.isBuffer(rawMessage)
              ? rawMessage.toString("utf8")
              : Array.isArray(rawMessage)
                ? Buffer.concat(rawMessage).toString("utf8")
                : Buffer.from(rawMessage).toString("utf8");
        const parsed = mediaStreamEventSchema.parse(JSON.parse(payloadText)) satisfies MediaStreamEvent;
        void this.processStreamEvent(parsed, session, webSocket);
      } catch (error) {
        this.logger.warn({ err: error }, "Rejected invalid Twilio media stream event");
        webSocket.close(1008, "Invalid stream payload");
      }
    });

    webSocket.on("close", () => {
      clearInterval(heartbeat);
      if (session.playbackTimeout) {
        clearTimeout(session.playbackTimeout);
      }

      if (session.callSid) {
        this.callSessionService.clearSession(session.callSid);
      }

      if (session.callDbId) {
        void this.voiceRepository
          .createCallLog(session.callDbId, "STREAM_CLOSED", "Twilio media stream WebSocket closed", {
            mediaFrames: session.mediaFrames,
            connectedDurationMs: Date.now() - session.connectedAt,
          })
          .catch((err: unknown) => {
            this.logger.error({ err }, "Failed to write STREAM_CLOSED call log");
          });
      }

      this.logger.info(
        {
          streamSid: session.streamSid,
          callSid: session.callSid,
          mediaFrames: session.mediaFrames,
          connectedDurationMs: Date.now() - session.connectedAt
        },
        "Closed Twilio media stream websocket"
      );
    });

    webSocket.on("error", (error) => {
      this.logger.error({ err: error }, "Twilio media stream websocket error");
    });

    this.logger.info(
      {
        remoteAddress: request.socket.remoteAddress
      },
      "Accepted Twilio media stream websocket connection"
    );
  }

  private async processStreamEvent(event: MediaStreamEvent, session: ActiveStreamSession, webSocket: WebSocket): Promise<void> {
    switch (event.event) {
      case "connected":
        this.logger.debug(
          {
            protocol: event.protocol,
            version: event.version
          },
          "Twilio media stream connected"
        );
        break;

      case "start": {
        session.accountSid = event.start.accountSid;
        session.callSid = event.start.callSid;
        session.streamSid = event.start.streamSid;

        // Resolve the DB Call record to get its UUID for subsequent log/history writes.
        const callRecord = await this.voiceRepository.findCallBySid(event.start.callSid).catch((err: unknown) => {
          this.logger.error({ err, callSid: event.start.callSid }, "Failed to look up Call record on stream start");
          return null;
        });

        if (callRecord) {
          session.callDbId = callRecord.id;

          await this.voiceRepository
            .createCallLog(callRecord.id, "STREAM_STARTED", "Twilio media stream started", {
              streamSid: event.start.streamSid,
              mediaFormat: event.start.mediaFormat,
            })
            .catch((err: unknown) => {
              this.logger.error({ err }, "Failed to write STREAM_STARTED call log");
            });
        }

        // Initialize in-memory call session.
        this.callSessionService.createSession(
          event.start.callSid,
          callRecord?.id ?? `call-db-${event.start.callSid}`,
          this.config.twilioDefaultLanguage
        );

        this.logger.info(
          {
            accountSid: event.start.accountSid,
            callSid: event.start.callSid,
            streamSid: event.start.streamSid,
            mediaFormat: event.start.mediaFormat,
            customParameters: event.start.customParameters
          },
          "Twilio media stream started"
        );

        // Send an immediate spoken greeting so the caller hears something right away.
        void this.sendGreeting(event.start.callSid, event.start.streamSid, webSocket);
        break;
      }

      case "media":
        session.streamSid = event.streamSid;
        session.mediaFrames += 1;

        // Caller Interruption (Barge-In) Detection
        if (session.isPlayingAudio && this.isUserSpeaking(event.media.payload)) {
          this.logger.info(
            { callSid: session.callSid, streamSid: session.streamSid },
            "Caller speech interruption detected. Clearing playback buffer."
          );

          if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(
              JSON.stringify({
                event: "clear",
                streamSid: session.streamSid,
              })
            );
          }

          if (session.playbackTimeout) {
            clearTimeout(session.playbackTimeout);
            delete session.playbackTimeout;
          }

          session.isPlayingAudio = false;
          session.audioBuffers = []; // Discard trailing audio packets from previous turn

          if (session.callDbId) {
            void this.voiceRepository
              .createCallLog(session.callDbId, "CALLER_INTERRUPTED", "Caller interrupted assistant audio playback")
              .catch((err: unknown) => {
                this.logger.error({ err }, "Failed to write CALLER_INTERRUPTED call log");
              });
          }
          break;
        }

        // Accumulate audio packets.
        session.audioBuffers.push(Buffer.from(event.media.payload, "base64"));

        // Trigger turn execution logic when threshold of audio packets (e.g. 50 frames ~ 1 second) is reached.
        if (
          session.mediaFrames > 0 &&
          session.mediaFrames % 50 === 0 &&
          !session.isProcessing &&
          session.callSid
        ) {
          void this.handleSpeechTurn(session, webSocket);
        }
        break;

      case "stop":
        session.callSid = event.stop.callSid;
        session.accountSid = event.stop.accountSid;
        session.streamSid = event.streamSid;

        this.logger.info(
          {
            accountSid: event.stop.accountSid,
            callSid: event.stop.callSid,
            streamSid: event.streamSid,
            mediaFrames: session.mediaFrames
          },
          "Twilio media stream stopped"
        );
        break;

      case "mark":
        this.logger.debug({ streamSid: event.streamSid, name: event.mark.name }, "Received stream mark");
        break;

      case "dtmf":
        this.logger.info(
          {
            streamSid: event.streamSid,
            digit: event.dtmf.digit,
            track: event.dtmf.track
          },
          "Received DTMF event from Twilio media stream"
        );
        break;
    }
  }

  /**
   * Synthesizes and sends a warm greeting to the caller the moment the media stream opens.
   * Introduces Bharat Voice as an official Government of India AI assistant.
   */
  private async sendGreeting(callSid: string, streamSid: string, webSocket: WebSocket): Promise<void> {
    const lang = this.config.twilioDefaultLanguage ?? "hi-IN";

    // Greeting in caller's language â€” introduces Bharat Voice as Govt of India assistant
    const greetingText = lang.startsWith("hi")
      ? "à¤¨à¤®à¤¸à¥à¤¤à¥‡! à¤®à¥ˆà¤‚ à¤­à¤¾à¤°à¤¤ à¤µà¥‰à¤¯à¤¸ à¤¹à¥‚à¤ â€” à¤­à¤¾à¤°à¤¤ à¤¸à¤°à¤•à¤¾à¤° à¤¦à¥à¤µà¤¾à¤°à¤¾ à¤µà¤¿à¤•à¤¸à¤¿à¤¤ à¤†à¤ªà¤•à¤¾ AI à¤¸à¤¹à¤¾à¤¯à¤•à¥¤ à¤†à¤ª à¤®à¥à¤à¤¸à¥‡ à¤•à¤¿à¤¸à¥€ à¤­à¥€ à¤µà¤¿à¤·à¤¯ à¤ªà¤° à¤¸à¤µà¤¾à¤² à¤ªà¥‚à¤› à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤ à¤¬à¤¤à¤¾à¤‡à¤, à¤®à¥ˆà¤‚ à¤†à¤ªà¤•à¥€ à¤•à¥ˆà¤¸à¥‡ à¤®à¤¦à¤¦ à¤•à¤°à¥‚à¤?"
      : lang.startsWith("ta")
      ? "à®µà®£à®•à¯à®•à®®à¯! à®¨à®¾à®©à¯ à®ªà®¾à®°à®¤à¯ à®µà®¾à®¯à¯à®¸à¯ â€” à®‡à®¨à¯à®¤à®¿à®¯ à®…à®°à®šà®¾à®™à¯à®•à®®à¯ à®‰à®°à¯à®µà®¾à®•à¯à®•à®¿à®¯ AI à®‰à®¤à®µà®¿à®¯à®¾à®³à®°à¯. à®¨à¯€à®™à¯à®•à®³à¯ à®Žà®¨à¯à®¤ à®µà®¿à®·à®¯à®¤à¯à®¤à¯ˆà®¯à¯à®®à¯ à®•à¯‡à®Ÿà¯à®•à®²à®¾à®®à¯. à®šà¯Šà®²à¯à®²à¯à®™à¯à®•à®³à¯, à®¨à®¾à®©à¯ à®‰à®™à¯à®•à®³à¯à®•à¯à®•à¯ à®Žà®µà¯à®µà®¾à®±à¯ à®‰à®¤à®µà®²à®¾à®®à¯?"
      : lang.startsWith("te")
      ? "à°¨à°®à°¸à±à°•à°¾à°°à°‚! à°¨à±‡à°¨à± à°­à°¾à°°à°¤à± à°µà°¾à°¯à°¿à°¸à± â€” à°­à°¾à°°à°¤ à°ªà±à°°à°­à±à°¤à±à°µà°‚ à°…à°­à°¿à°µà±ƒà°¦à±à°§à°¿ à°šà±‡à°¸à°¿à°¨ AI à°¸à°¹à°¾à°¯à°•à±à°¡à°¿à°¨à°¿. à°®à±€à°°à± à° à°µà°¿à°·à°¯à°‚à°ªà±ˆà°¨à±ˆà°¨à°¾ à°…à°¡à°—à°µà°šà±à°šà±. à°šà±†à°ªà±à°ªà°‚à°¡à°¿, à°¨à±‡à°¨à± à°®à±€à°•à± à°Žà°²à°¾ à°¸à°¹à°¾à°¯à°ªà°¡à°—à°²à°¨à±?"
      : lang.startsWith("kn")
      ? "à²¨à²®à²¸à³à²•à²¾à²°! à²¨à²¾à²¨à³ à²­à²¾à²°à²¤à³ à²µà²¾à²¯à³à²¸à³ â€” à²­à²¾à²°à²¤ à²¸à²°à³à²•à²¾à²° à²…à²­à²¿à²µà³ƒà²¦à³à²§à²¿à²ªà²¡à²¿à²¸à²¿à²¦ AI à²¸à²¹à²¾à²¯à²•. à²¨à³€à²µà³ à²¯à²¾à²µà³à²¦à³‡ à²µà²¿à²·à²¯à²¦ à²¬à²—à³à²—à³† à²•à³‡à²³à²¬à²¹à³à²¦à³. à²¹à³‡à²³à²¿, à²¨à²¾à²¨à³ à²¨à²¿à²®à²—à³† à²¹à³‡à²—à³† à²¸à²¹à²¾à²¯ à²®à²¾à²¡à²²à²¿?"
      : lang.startsWith("ml")
      ? "à´¨à´®à´¸àµà´•à´¾à´°à´‚! à´žà´¾àµ» à´­à´¾à´°à´¤àµ à´µàµ‹à´¯àµà´¸àµ â€” à´­à´¾à´°à´¤ à´¸àµ¼à´•àµà´•à´¾àµ¼ à´µà´¿à´•à´¸à´¿à´ªàµà´ªà´¿à´šàµà´š AI à´…à´¸à´¿à´¸àµà´±àµà´±à´¨àµà´±àµ à´†à´£àµ. à´¨à´¿à´™àµà´™àµ¾à´•àµà´•àµ à´à´¤àµ à´•à´¾à´°àµà´¯à´µàµà´‚ à´šàµ‹à´¦à´¿à´•àµà´•à´¾à´‚. à´ªà´±à´¯àµ‚, à´žà´¾àµ» à´Žà´™àµà´™à´¨àµ† à´¸à´¹à´¾à´¯à´¿à´•àµà´•à´£à´‚?"
      : lang.startsWith("bn")
      ? "à¦¨à¦®à¦¸à§à¦•à¦¾à¦°! à¦†à¦®à¦¿ à¦­à¦¾à¦°à¦¤ à¦­à¦¯à¦¼à§‡à¦¸ â€” à¦­à¦¾à¦°à¦¤ à¦¸à¦°à¦•à¦¾à¦° à¦•à¦°à§à¦¤à§ƒà¦• à¦¤à§ˆà¦°à¦¿ AI à¦¸à¦¹à¦•à¦¾à¦°à§€à¥¤ à¦†à¦ªà¦¨à¦¿ à¦¯à§‡à¦•à§‹à¦¨à§‹ à¦¬à¦¿à¦·à¦¯à¦¼à§‡ à¦†à¦®à¦¾à¦•à§‡ à¦œà¦¿à¦œà§à¦žà§‡à¦¸ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨à¥¤ à¦¬à¦²à§à¦¨, à¦†à¦®à¦¿ à¦†à¦ªà¦¨à¦¾à¦•à§‡ à¦•à§€à¦­à¦¾à¦¬à§‡ à¦¸à¦¾à¦¹à¦¾à¦¯à§à¦¯ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à¦¿?"
      : lang.startsWith("mr")
      ? "à¤¨à¤®à¤¸à¥à¤•à¤¾à¤°! à¤®à¥€ à¤­à¤¾à¤°à¤¤ à¤µà¥à¤¹à¥‰à¤‡à¤¸ à¤†à¤¹à¥‡ â€” à¤­à¤¾à¤°à¤¤ à¤¸à¤°à¤•à¤¾à¤°à¤¨à¥‡ à¤µà¤¿à¤•à¤¸à¤¿à¤¤ à¤•à¥‡à¤²à¥‡à¤²à¤¾ AI à¤¸à¤¹à¤¾à¤¯à¥à¤¯à¤•. à¤¤à¥à¤®à¥à¤¹à¥€ à¤®à¤²à¤¾ à¤•à¥‹à¤£à¤¤à¥à¤¯à¤¾à¤¹à¥€ à¤µà¤¿à¤·à¤¯à¤¾à¤µà¤° à¤µà¤¿à¤šà¤¾à¤°à¥‚ à¤¶à¤•à¤¤à¤¾. à¤¸à¤¾à¤‚à¤—à¤¾, à¤®à¥€ à¤¤à¥à¤®à¥à¤¹à¤¾à¤²à¤¾ à¤•à¤¶à¥€ à¤®à¤¦à¤¤ à¤•à¤°à¥‚?"
      : "Hello! I'm Bharat Voice â€” an AI assistant developed by the Government of India. You can ask me anything. Go ahead, how can I help you today?";

    try {
      const audioBuffer = await this.speechService.synthesizeSpeech(greetingText, lang);

      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: {
              payload: audioBuffer.toString("base64"),
            },
          })
        );

        this.logger.info({ callSid, streamSid, lang }, "Sent Bharat Voice greeting audio to caller");
      }
    } catch (err) {
      this.logger.error({ err, callSid }, "Failed to send greeting audio");
    }
  }

  private async handleSpeechTurn(session: ActiveStreamSession, webSocket: WebSocket): Promise<void> {
    if (!session.callSid || !session.streamSid) return;

    session.isProcessing = true;
    this.logger.info({ callSid: session.callSid }, "Triggering speech-to-text processing turn");

    try {
      const fullAudioBuffer = Buffer.concat(session.audioBuffers);
      // Reset buffers for next speech turn.
      session.audioBuffers = [];

      const dbSession = this.callSessionService.getSession(session.callSid);
      const lang = dbSession?.languageCode ?? this.config.twilioDefaultLanguage;

      // 1. Transcribe input stream.
      const result = await this.speechService.transcribeAudioBuffer(fullAudioBuffer, lang);
      const text = result.transcript;
      const detectedLang = result.languageCode;
      this.logger.info({ callSid: session.callSid, text, detectedLang }, "Citizen audio transcription completed");

      // Automatically update the session language if a change was detected
      if (detectedLang !== lang && dbSession) {
        this.logger.info(
          { callSid: session.callSid, oldLang: lang, newLang: detectedLang },
          "Detected language change during conversation"
        );
        this.callSessionService.updateLanguage(session.callSid, detectedLang);
      }

      if (text.trim().length > 0) {
        const citizenTurnIndex = session.turnIndex++;

        // Persist the citizen's turn to the transcript.
        if (session.callDbId) {
          void this.voiceRepository
            .createConversationTurn(
              session.callDbId,
              citizenTurnIndex,
              ConversationSpeakerRole.CITIZEN,
              text
            )
            .catch((err: unknown) => {
              this.logger.error({ err, callSid: session.callSid }, "Failed to persist citizen conversation turn");
            });
        }

        this.callSessionService.addTurn(session.callSid, "citizen", text);

        // Get dialogue history formatted for Gemini.
        const history = this.callSessionService.getHistoryForGemini(session.callSid);

        // 2. Generate grounded output response.
        const aiResponse = await this.groundingEngine.generateGroundedResponse(text, history, detectedLang);
        this.logger.info({ callSid: session.callSid, isGrounded: aiResponse.isGrounded }, "AI response generated");

        this.callSessionService.addTurn(session.callSid, "assistant", aiResponse.response);

        const assistantTurnIndex = session.turnIndex++;

        // Persist the assistant's response turn to the transcript.
        if (session.callDbId) {
          void this.voiceRepository
            .createConversationTurn(
              session.callDbId,
              assistantTurnIndex,
              ConversationSpeakerRole.ASSISTANT,
              aiResponse.response
            )
            .catch((err: unknown) => {
              this.logger.error({ err, callSid: session.callSid }, "Failed to persist assistant conversation turn");
            });
        }

        // 3. Auto-escalate: create a support ticket when the AI cannot answer.
        if (aiResponse.fallbackTriggered && session.callDbId) {
          const callIdForNotification = session.callDbId;
          void this.voiceRepository
            .createTicket(
              callIdForNotification,
              "Unresolved citizen query escalation",
              `Citizen query could not be answered from verified government documents.\n\nQuery: ${text}`
            )
            .then(() => {
              this.logger.info(
                { callSid: session.callSid, callDbId: callIdForNotification },
                "Escalation ticket created for unanswered citizen query"
              );
              // Broadcast notification to all active administrators
              void this.notificationService.broadcastToAdmins(
                NotificationType.TICKET,
                "Citizen Escalation Ticket Created",
                `Call ID: ${callIdForNotification}. Query: "${text}"`,
                { callId: callIdForNotification }
              ).catch((err: unknown) => {
                this.logger.error({ err, callSid: session.callSid }, "Failed to broadcast escalation notification to admins");
              });
            })
            .catch((err: unknown) => {
              this.logger.error({ err, callSid: session.callSid }, "Failed to create escalation ticket");
            });
        }

        // 4. Synthesize output response text to speech.
        const audioOut = await this.speechService.synthesizeSpeech(aiResponse.response, detectedLang);

        // 5. Send audio packet payload back to Twilio.
        if (webSocket.readyState === WebSocket.OPEN) {
          // Clear existing timeout if any
          if (session.playbackTimeout) {
            clearTimeout(session.playbackTimeout);
          }

          webSocket.send(
            JSON.stringify({
              event: "media",
              streamSid: session.streamSid,
              media: {
                payload: audioOut.toString("base64"),
              },
            })
          );

          // Track playback duration: G.711 mu-law is 8000 bytes per second
          session.isPlayingAudio = true;
          const durationMs = (audioOut.length / 8000) * 1000;

          session.playbackTimeout = setTimeout(() => {
            session.isPlayingAudio = false;
            delete session.playbackTimeout;
            this.logger.debug({ streamSid: session.streamSid }, "Assistant audio playback completed");
          }, durationMs);

          this.logger.debug(
            { streamSid: session.streamSid, durationMs },
            "Sent synthesized audio payload to Twilio and started playback tracking"
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error, callSid: session.callSid }, "Failed to process speech turn");
    } finally {
      session.isProcessing = false;
    }
  }

  private getUrl(request: IncomingMessage): URL {
    return new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  }

  private isAuthorized(url: URL, request: IncomingMessage): boolean {
    if (!this.config.twilioMediaStreamEnabled) {
      return false;
    }

    // If token is present, validate it
    const token = url.searchParams.get("token");
    if (token && this.config.twilioMediaStreamSecret) {
      return token === this.config.twilioMediaStreamSecret;
    }

    // Fallback: If Twilio strips query params, verify request comes from Twilio user-agent
    const userAgent = request.headers["user-agent"];
    if (userAgent && userAgent.startsWith("Twilio")) {
      return true;
    }

    return false;
  }

  private rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
    socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}
