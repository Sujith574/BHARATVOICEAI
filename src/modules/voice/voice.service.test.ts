import pino from "pino";

import type { AppConfig } from "../../config/env";
import { VoiceService } from "./voice.service";
import type { VoiceRepository } from "./voice.repository";

// ─── Stub VoiceRepository ─────────────────────────────────────────────────────

const noopVoiceRepository: VoiceRepository = {
  createCall: () => Promise.resolve({} as never),
  updateCall: () => Promise.resolve({} as never),
  findCallBySid: () => Promise.resolve(null),
  createCallLog: () => Promise.resolve({} as never),
  createConversationTurn: () => Promise.resolve({} as never),
  createTicket: () => Promise.resolve({} as never),
};

// ─── Base config ─────────────────────────────────────────────────────────────

const baseConfig: AppConfig = {
  nodeEnv: "test",
  appName: "bharat-voice-backend-test",
  appVersion: "0.1.0-test",
  port: 3001,
  apiPrefix: "/api/v1",
  publicBaseUrl: "https://bharat-voice.example.com",
  corsOrigins: ["http://localhost:8081"],
  logLevel: "silent",
  trustProxyHops: 0,
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/bharat_voice_test",
  directUrl: "postgresql://postgres:postgres@127.0.0.1:5432/bharat_voice_test",
  prismaQueryLoggingEnabled: false,
  supabaseUrl: "https://bharat-voice.supabase.co",
  supabaseAnonKey: "anon-key",
  supabaseServiceRoleKey: "service-role-key",
  supabaseJwtAudience: "authenticated",
  supabaseJwksUrl: "https://bharat-voice.supabase.co/auth/v1/.well-known/jwks.json",
  supabaseJwtIssuer: "https://bharat-voice.supabase.co/auth/v1",
  defaultAdminRoleCode: "ADMIN_VIEWER",
  superAdminEmails: ["superadmin@example.gov.in"],
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 120,
  twilioAuthToken: undefined,
  twilioSignatureValidationEnabled: false,
  twilioMediaStreamEnabled: false,
  twilioMediaStreamPublicUrl: undefined,
  twilioMediaStreamSecret: undefined,
  twilioDefaultLanguage: "en-IN",
  geminiApiKey: "mock-gemini-key",
  sarvamApiKey: "mock-sarvam-key",
  wsHeartbeatIntervalMs: 15000
};

describe("VoiceService", () => {
  it("falls back gracefully when media streams are disabled", async () => {
    const service = new VoiceService(baseConfig, pino({ enabled: false }), noopVoiceRepository);

    const response = await service.buildIncomingCallResponse({
      callSid: "CA123",
      accountSid: "AC123",
      from: "+919999999999",
      to: "+911234567890",
      callStatus: "ringing",
      direction: "inbound"
    });

    expect(response).toContain("<Say");
    expect(response).toContain("Bharat Voice is not accepting live audio streams right now");
    expect(response).toContain("<Hangup/>");
  });

  it("builds a secure Twilio media stream response when streaming is enabled", async () => {
    const service = new VoiceService(
      {
        ...baseConfig,
        twilioMediaStreamEnabled: true,
        twilioMediaStreamSecret: "super-secure-stream-secret"
      },
      pino({ enabled: false }),
      noopVoiceRepository
    );

    const response = await service.buildIncomingCallResponse({
      callSid: "CA123",
      accountSid: "AC123",
      from: "+919999999999",
      to: "+911234567890",
      callStatus: "ringing",
      direction: "inbound"
    });

    expect(response).toContain("<Connect>");
    expect(response).toContain("wss://bharat-voice.example.com/api/v1/voice/media-stream?token=super-secure-stream-secret");
    expect(response).toContain("statusCallback=\"https://bharat-voice.example.com/api/v1/voice/twilio/status\"");
  });
});
