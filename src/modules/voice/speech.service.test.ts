/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { WebSocket } from "ws";
import type { Logger } from "pino";

import { SpeechService } from "./speech.service";
import { VoiceStreamGateway } from "./voice-stream.gateway";
import { CallSessionService } from "./call-session.service";
import type { GroundingEngine } from "../ai/grounding.engine";
import type { AppConfig } from "../../config/env";
import type { VoiceRepository } from "./voice.repository";

describe("SpeechService", () => {
  const mockConfig = {
    nodeEnv: "test",
  } as unknown as AppConfig;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return mock transcription in mock mode", async () => {
    const service = new SpeechService(mockConfig);
    const buffer = Buffer.from("test-audio-data");

    const resultEn = await service.transcribeAudioBuffer(buffer, "en-IN");
    expect(resultEn.transcript).toBe("How do I get a ration card?");
    expect(resultEn.languageCode).toBe("en-IN");

    const resultHi = await service.transcribeAudioBuffer(buffer, "hi-IN");
    expect(resultHi.transcript).toBe("मुझे राशन कार्ड के नियम बताएं");
    expect(resultHi.languageCode).toBe("hi-IN");
  });

  it("should return empty transcription if buffer is empty", async () => {
    const service = new SpeechService(mockConfig);
    const result = await service.transcribeAudioBuffer(Buffer.alloc(0), "en-IN");
    expect(result.transcript).toBe("");
    expect(result.languageCode).toBe("en-IN");
  });

  it("should synthesize silent mu-law audio in mock mode", async () => {
    const service = new SpeechService(mockConfig);
    const audio = await service.synthesizeSpeech("polite response", "en-IN");

    expect(audio.length).toBe(800);
    expect(audio[0]).toBe(0xff); // mu-law silence byte
  });

  it("should return empty buffer for empty text synthesis", async () => {
    const service = new SpeechService(mockConfig);
    const audio = await service.synthesizeSpeech("", "en-IN");
    expect(audio.length).toBe(0);
  });

  describe("Live API Mode Integration", () => {
    const liveConfig = {
      nodeEnv: "production",
      sarvamApiKey: "real-test-api-key",
    } as unknown as AppConfig;

    it("should call transcribe endpoint when api key is provided", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          transcript: "Namaste Bharat",
          language_code: "hi-IN",
        }),
      } as Response);

      const service = new SpeechService(liveConfig);
      const buffer = Buffer.from("fake-mu-law-data");
      const result = await service.transcribeAudioBuffer(buffer, "en-IN");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.sarvam.ai/speech-to-text",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "api-subscription-key": "real-test-api-key",
          }),
        })
      );
      expect(result.transcript).toBe("Namaste Bharat");
      expect(result.languageCode).toBe("hi-IN");
    });

    it("should call synthesize endpoint when api key is provided", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          audios: [Buffer.from("synthesized-audio").toString("base64")],
        }),
      } as Response);

      const service = new SpeechService(liveConfig);
      const audioBuffer = await service.synthesizeSpeech("Welcome", "en-IN");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.sarvam.ai/text-to-speech",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "api-subscription-key": "real-test-api-key",
          }),
          body: expect.stringContaining('"text":"Welcome"'),
        })
      );
      expect(audioBuffer.toString()).toBe("synthesized-audio");
    });

    it("should propagate errors from ASR failures", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      } as Response);

      const service = new SpeechService(liveConfig);
      const buffer = Buffer.from("fake-mu-law-data");
      await expect(service.transcribeAudioBuffer(buffer, "en-IN")).rejects.toThrow(
        /Sarvam ASR API error/
      );
    });

    it("should propagate errors from TTS failures", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      const service = new SpeechService(liveConfig);
      await expect(service.synthesizeSpeech("Error", "en-IN")).rejects.toThrow(
        /Sarvam TTS API error/
      );
    });

    it("should return cached audio buffer on subsequent synthesizeSpeech calls", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          audios: [Buffer.from("cached-audio-bytes").toString("base64")],
        }),
      } as Response);

      const service = new SpeechService(liveConfig);
      
      // First call (cache miss, fetch called)
      const buf1 = await service.synthesizeSpeech("Cache me", "en-IN");
      expect(buf1.toString()).toBe("cached-audio-bytes");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call (cache hit, fetch not called again)
      const buf2 = await service.synthesizeSpeech("Cache me", "en-IN");
      expect(buf2).toEqual(buf1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("VoiceStreamGateway Integration", () => {
  const mockConfig = {
    nodeEnv: "test",
    twilioDefaultLanguage: "en-IN",
    wsHeartbeatIntervalMs: 15000,
    twilioMediaStreamEnabled: true,
    twilioMediaStreamSecret: "secret-token",
  } as unknown as AppConfig;

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;

  const mockGroundingEngine = {
    generateGroundedResponse: vi.fn(),
  } as unknown as GroundingEngine;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should orchestrate events and trigger conversational turn", async () => {
    const callSessionService = new CallSessionService();
    const speechService = new SpeechService(mockConfig);

    // No-op repository stub — tests do not touch a real database.
    const noopVoiceRepository: VoiceRepository = {
      createCall: () => Promise.resolve({} as never),
      updateCall: () => Promise.resolve({} as never),
      findCallBySid: () => Promise.resolve(null),
      createCallLog: () => Promise.resolve({} as never),
      createConversationTurn: () => Promise.resolve({} as never),
      createTicket: () => Promise.resolve({} as never),
    };

    const gateway = new VoiceStreamGateway(
      mockConfig,
      mockLogger,
      callSessionService,
      mockGroundingEngine,
      speechService,
      noopVoiceRepository,
      { broadcastToAdmins: () => Promise.resolve() } as any
    );

    // Mock GroundingEngine answer
    vi.spyOn(mockGroundingEngine, "generateGroundedResponse").mockResolvedValueOnce({
      response: "Please apply online.",
      isGrounded: true,
      fallbackTriggered: false,
    });

    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      on: vi.fn(),
      ping: vi.fn(),
    } as unknown as WebSocket;

    const sendSpy = vi.spyOn(mockWs, "send");

    // Simulate session start
    const sessionState = {
      mediaFrames: 0,
      connectedAt: Date.now(),
      audioBuffers: [] as Buffer[],
      isProcessing: false,
      callSid: "",
      streamSid: "",
      accountSid: "",
      turnIndex: 0,
      isPlayingAudio: false,
    };

    // 1. Process 'start' event
    await gateway["processStreamEvent"](
      {
        event: "start",
        sequenceNumber: "1",
        start: {
          accountSid: "AC123",
          callSid: "CA999",
          streamSid: "ST111",
          tracks: ["inbound"],
          mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        },
      },
      sessionState,
      mockWs
    );

    expect(sessionState.callSid).toBe("CA999");
    expect(sessionState.streamSid).toBe("ST111");

    const createdSession = callSessionService.getSession("CA999");
    expect(createdSession).toBeDefined();

    // 2. Send 49 media frames (not triggering speech turn yet)
    for (let i = 0; i < 49; i++) {
      void gateway["processStreamEvent"](
        {
          event: "media",
          sequenceNumber: String(i + 2),
          streamSid: "ST111",
          media: {
            track: "inbound",
            chunk: String(i),
            timestamp: "100",
            payload: Buffer.from("dummy").toString("base64"),
          },
        },
        sessionState,
        mockWs
      );
    }

    expect(sessionState.mediaFrames).toBe(49);
    expect(sessionState.isProcessing).toBe(false);

    // 3. Send 50th frame -> triggers turn execution
    void gateway["processStreamEvent"](
      {
        event: "media",
        sequenceNumber: "51",
        streamSid: "ST111",
        media: {
          track: "inbound",
          chunk: "49",
          timestamp: "100",
          payload: Buffer.from("dummy").toString("base64"),
        },
      },
      sessionState,
      mockWs
    );

    // Give asynchronous turn execution a microtask tick to finish
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(sessionState.mediaFrames).toBe(50);
    // Should have added citizen & assistant turns
    const callHistory = callSessionService.getHistoryForGemini("CA999");
    expect(callHistory).toHaveLength(2);
    expect(callHistory[0]?.parts[0]?.text).toBe("How do I get a ration card?"); // Mock STT response
    expect(callHistory[1]?.parts[0]?.text).toBe("Please apply online.");

    // Should have sent back synthesized audio package
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"media"')
    );
  });

  it("should trigger caller interruption when high energy audio is received while playing audio", async () => {
    const callSessionService = new CallSessionService();
    const speechService = new SpeechService(mockConfig);

    const noopVoiceRepository: VoiceRepository = {
      createCall: () => Promise.resolve({} as never),
      updateCall: () => Promise.resolve({} as never),
      findCallBySid: () => Promise.resolve(null),
      createCallLog: () => Promise.resolve({} as never),
      createConversationTurn: () => Promise.resolve({} as never),
      createTicket: () => Promise.resolve({} as never),
    };

    const gateway = new VoiceStreamGateway(
      mockConfig,
      mockLogger,
      callSessionService,
      mockGroundingEngine,
      speechService,
      noopVoiceRepository,
      { broadcastToAdmins: () => Promise.resolve() } as any
    );

    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      on: vi.fn(),
      ping: vi.fn(),
    } as unknown as WebSocket;

    const sendSpy = vi.spyOn(mockWs, "send");

    // Set up session state currently playing audio
    const sessionState = {
      mediaFrames: 10,
      connectedAt: Date.now(),
      audioBuffers: [] as Buffer[],
      isProcessing: false,
      callSid: "CA999",
      streamSid: "ST111",
      accountSid: "AC123",
      turnIndex: 1,
      isPlayingAudio: true,
      playbackTimeout: setTimeout(() => {}, 10000),
    };

    // Construct high energy mu-law payload (0x00 yields max amplitude)
    const highEnergyBuffer = Buffer.alloc(160, 0x00);
    const payloadBase64 = highEnergyBuffer.toString("base64");

    await gateway["processStreamEvent"](
      {
        event: "media",
        sequenceNumber: "12",
        streamSid: "ST111",
        media: {
          track: "inbound",
          chunk: "1",
          timestamp: "200",
          payload: payloadBase64,
        },
      },
      sessionState,
      mockWs
    );

    // Expect Twilio to be sent a clear event
    expect(sendSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "clear",
        streamSid: "ST111",
      })
    );

    // Expect state changes
    expect(sessionState.isPlayingAudio).toBe(false);
    expect(sessionState.playbackTimeout).toBeUndefined();
    expect(sessionState.audioBuffers).toHaveLength(0);
  });
});
