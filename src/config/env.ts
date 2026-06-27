import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_NAME: z.string().min(1).default("bharat-voice-backend"),
    APP_VERSION: z.string().min(1).default("0.1.0"),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().regex(/^\/.*/).default("/api/v1"),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    CORS_ORIGIN: z.string().min(1).default("*"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    PRISMA_QUERY_LOGGING_ENABLED: booleanFromString.default(false),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
    SUPABASE_JWKS_URL: z
      .string()
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    DEFAULT_ADMIN_ROLE_CODE: z.string().min(1).default("ADMIN_VIEWER"),
    SUPER_ADMIN_EMAILS: z.string().default(""),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_SIGNATURE_VALIDATION_ENABLED: booleanFromString.default(true),
    TWILIO_MEDIA_STREAM_ENABLED: booleanFromString.default(false),
    TWILIO_MEDIA_STREAM_PUBLIC_URL: z
      .string()
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    TWILIO_MEDIA_STREAM_SECRET: z.string().min(16).optional().or(z.literal("").transform(() => undefined)),
    TWILIO_DEFAULT_LANGUAGE: z.enum(["en-IN", "te-IN", "hi-IN"]).default("en-IN"),
    GEMINI_API_KEY: z.string().min(1).default("mock-gemini-key"),
    SARVAM_API_KEY: z.string().optional(),
    WS_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15000)
  })
  .superRefine((env, context) => {
    if (env.TWILIO_SIGNATURE_VALIDATION_ENABLED && !env.TWILIO_AUTH_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TWILIO_AUTH_TOKEN is required when TWILIO_SIGNATURE_VALIDATION_ENABLED=true.",
        path: ["TWILIO_AUTH_TOKEN"]
      });
    }

    if (env.TWILIO_MEDIA_STREAM_ENABLED && !env.TWILIO_MEDIA_STREAM_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TWILIO_MEDIA_STREAM_SECRET is required when TWILIO_MEDIA_STREAM_ENABLED=true.",
        path: ["TWILIO_MEDIA_STREAM_SECRET"]
      });
    }
  });

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  appName: string;
  appVersion: string;
  port: number;
  apiPrefix: string;
  publicBaseUrl: string;
  corsOrigins: string[];
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  trustProxyHops: number;
  databaseUrl: string;
  directUrl: string;
  prismaQueryLoggingEnabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  supabaseJwtAudience: string;
  supabaseJwksUrl: string;
  supabaseJwtIssuer: string;
  defaultAdminRoleCode: string;
  superAdminEmails: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  twilioAuthToken: string | undefined;
  twilioSignatureValidationEnabled: boolean;
  twilioMediaStreamEnabled: boolean;
  twilioMediaStreamPublicUrl: string | undefined;
  twilioMediaStreamSecret: string | undefined;
  twilioDefaultLanguage: "en-IN" | "te-IN" | "hi-IN";
  geminiApiKey: string;
  sarvamApiKey: string | undefined;
  wsHeartbeatIntervalMs: number;
}

const toCorsOrigins = (rawOrigins: string): string[] =>
  rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const toStringArray = (rawValue: string): string[] =>
  rawValue
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = environmentSchema.parse(source);
  const supabaseBaseUrl = new URL(parsed.SUPABASE_URL);
  const supabaseJwtIssuer = new URL("/auth/v1", supabaseBaseUrl).toString().replace(/\/$/, "");
  const supabaseJwksUrl = parsed.SUPABASE_JWKS_URL ?? new URL("/auth/v1/.well-known/jwks.json", supabaseBaseUrl).toString();

  return {
    nodeEnv: parsed.NODE_ENV,
    appName: parsed.APP_NAME,
    appVersion: parsed.APP_VERSION,
    port: parsed.PORT,
    apiPrefix: parsed.API_PREFIX,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    corsOrigins: toCorsOrigins(parsed.CORS_ORIGIN),
    logLevel: parsed.LOG_LEVEL,
    trustProxyHops: parsed.TRUST_PROXY_HOPS,
    databaseUrl: parsed.DATABASE_URL,
    directUrl: parsed.DIRECT_URL,
    prismaQueryLoggingEnabled: parsed.PRISMA_QUERY_LOGGING_ENABLED,
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    supabaseJwtAudience: parsed.SUPABASE_JWT_AUDIENCE,
    supabaseJwksUrl,
    supabaseJwtIssuer,
    defaultAdminRoleCode: parsed.DEFAULT_ADMIN_ROLE_CODE,
    superAdminEmails: toStringArray(parsed.SUPER_ADMIN_EMAILS),
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: parsed.RATE_LIMIT_MAX_REQUESTS,
    twilioAuthToken: parsed.TWILIO_AUTH_TOKEN,
    twilioSignatureValidationEnabled: parsed.TWILIO_SIGNATURE_VALIDATION_ENABLED,
    twilioMediaStreamEnabled: parsed.TWILIO_MEDIA_STREAM_ENABLED,
    twilioMediaStreamPublicUrl: parsed.TWILIO_MEDIA_STREAM_PUBLIC_URL,
    twilioMediaStreamSecret: parsed.TWILIO_MEDIA_STREAM_SECRET,
    twilioDefaultLanguage: parsed.TWILIO_DEFAULT_LANGUAGE,
    geminiApiKey: parsed.GEMINI_API_KEY,
    sarvamApiKey: parsed.SARVAM_API_KEY,
    wsHeartbeatIntervalMs: parsed.WS_HEARTBEAT_INTERVAL_MS
  };
};
