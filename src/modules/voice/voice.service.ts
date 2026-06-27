import type { Logger } from "pino";
import { twiml } from "twilio";
import type { CallStatus } from "@prisma/client";

import type { AppConfig } from "../../config/env";
import type { IncomingCallPayload, StatusCallbackPayload } from "./voice.schemas";
import type { VoiceRepository } from "./voice.repository";

// ─── Twilio status → Prisma CallStatus mapping ───────────────────────────────

const TWILIO_TO_CALL_STATUS: Record<string, string> = {
  "initiated": "INITIATED",
  "ringing": "RINGING",
  "in-progress": "IN_PROGRESS",
  "completed": "COMPLETED",
  "failed": "FAILED",
  "no-answer": "NO_ANSWER",
  "busy": "BUSY",
  "canceled": "CANCELED",
};

export class VoiceService {
  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly voiceRepository: VoiceRepository
  ) {}

  public async buildIncomingCallResponse(payload: IncomingCallPayload): Promise<string> {
    const response = new twiml.VoiceResponse();

    if (!this.config.twilioMediaStreamEnabled) {
      response.say(
        { language: this.config.twilioDefaultLanguage, voice: "alice" },
        "Bharat Voice is not accepting live audio streams right now. Please try again shortly."
      );
      response.hangup();

      this.logger.warn(
        {
          callSid: payload.callSid,
          accountSid: payload.accountSid
        },
        "Rejected incoming call because media streaming is disabled"
      );

      return response.toString();
    }

    // Persist the Call record before issuing TwiML. Fire-and-forget errors are
    // caught and logged so they never interrupt the HTTP response.
    try {
      await this.voiceRepository.createCall(payload.callSid, payload.from);
    } catch (error) {
      this.logger.error(
        { err: error, callSid: payload.callSid },
        "Failed to persist Call record on incoming webhook"
      );
    }

    const connect = response.connect();
    connect.stream({
      url: this.buildMediaStreamUrl(),
      track: "inbound_track",
      statusCallback: this.buildStatusCallbackUrl(),
      statusCallbackMethod: "POST"
    });

    this.logger.info(
      {
        callSid: payload.callSid,
        accountSid: payload.accountSid,
        from: payload.from,
        to: payload.to
      },
      "Accepted incoming call and issued Twilio media stream instructions"
    );

    return response.toString();
  }

  public async logStatusCallback(payload: StatusCallbackPayload): Promise<void> {
    this.logger.info(
      {
        callSid: payload.callSid,
        callStatus: payload.callStatus,
        streamSid: payload.streamSid,
        timestamp: payload.timestamp
      },
      "Received Twilio voice status callback"
    );

    const prismaStatus = TWILIO_TO_CALL_STATUS[payload.callStatus.toLowerCase()];
    if (!prismaStatus) {
      return;
    }

    try {
      const isTerminal = prismaStatus === "COMPLETED" || prismaStatus === "FAILED";
      await this.voiceRepository.updateCall(payload.callSid, {
        status: prismaStatus as CallStatus,
        ...(isTerminal ? { endedAt: new Date() } : {}),
      });
    } catch (error) {
      this.logger.error(
        { err: error, callSid: payload.callSid },
        "Failed to update Call record on status callback"
      );
    }
  }

  private buildStatusCallbackUrl(): string {
    return new URL(`${this.config.apiPrefix}/voice/twilio/status`, this.config.publicBaseUrl).toString();
  }

  private buildMediaStreamUrl(): string {
    const streamUrl = this.config.twilioMediaStreamPublicUrl ?? this.deriveMediaStreamUrlFromPublicBase();
    const url = new URL(streamUrl);

    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = `${this.config.apiPrefix}/voice/media-stream`;
    }

    if (this.config.twilioMediaStreamSecret) {
      url.searchParams.set("token", this.config.twilioMediaStreamSecret);
    }

    return url.toString();
  }

  private deriveMediaStreamUrlFromPublicBase(): string {
    const publicUrl = new URL(this.config.publicBaseUrl);
    publicUrl.protocol = publicUrl.protocol === "https:" ? "wss:" : "ws:";
    publicUrl.pathname = `${this.config.apiPrefix}/voice/media-stream`;
    publicUrl.search = "";

    return publicUrl.toString();
  }
}
