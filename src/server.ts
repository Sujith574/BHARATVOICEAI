import { createServer } from "node:http";

import { createApp } from "./app/create-app";
import { loadEnv } from "./config/env";
import { createLogger } from "./config/logger";
import { PrismaAuthRepository } from "./modules/auth/auth.repository";
import { AuthService } from "./modules/auth/auth.service";
import { SupabaseJwtVerifier } from "./modules/auth/supabase-jwt-verifier";
import { HealthService } from "./modules/health/health.service";
import { PrismaAuditRepository } from "./modules/admin/audit/audit.repository";
import { AuditService } from "./modules/admin/audit/audit.service";
import { PrismaCallRepository } from "./modules/admin/calls/call.repository";
import { CallService } from "./modules/admin/calls/call.service";
import { PrismaRoleRepository } from "./modules/admin/roles/role.repository";
import { RoleService } from "./modules/admin/roles/role.service";
import { PrismaTicketRepository } from "./modules/admin/tickets/ticket.repository";
import { TicketService } from "./modules/admin/tickets/ticket.service";
import { PrismaUserRepository } from "./modules/admin/users/user.repository";
import { UserService } from "./modules/admin/users/user.service";
import { PrismaDeviceRepository } from "./modules/admin/devices/device.repository";
import { DeviceService } from "./modules/admin/devices/device.service";
import { PushNotificationService } from "./modules/admin/devices/push-notification.service";
import { HydrationService } from "./modules/admin/hydration/hydration.service";
import { NotificationRepository } from "./modules/admin/notifications/notification.repository";
import { NotificationService } from "./modules/admin/notifications/notification.service";
import { AnalyticsService } from "./modules/admin/analytics/analytics.service";
import { GeminiService } from "./modules/ai/gemini.service";
import { GroundingEngine } from "./modules/ai/grounding.engine";
import { DocumentParserService } from "./modules/knowledge/document-parser.service";
import { KnowledgeRepository } from "./modules/knowledge/knowledge.repository";
import { KnowledgeService } from "./modules/knowledge/knowledge.service";
import { VoiceService } from "./modules/voice/voice.service";
import { CallSessionService } from "./modules/voice/call-session.service";
import { SpeechService } from "./modules/voice/speech.service";
import { VoiceStreamGateway } from "./modules/voice/voice-stream.gateway";
import { PrismaVoiceRepository } from "./modules/voice/voice.repository";
import { PrismaService } from "./shared/prisma/prisma.service";

// ─── Configuration & Logger ───────────────────────────────────────────────────
const config = loadEnv();
const logger = createLogger(config);

// ─── Database ─────────────────────────────────────────────────────────────────
const prisma = new PrismaService(config);

// ─── Auth ─────────────────────────────────────────────────────────────────────
const authRepository = new PrismaAuthRepository(prisma);
const tokenVerifier = new SupabaseJwtVerifier(
  {
    audience: config.supabaseJwtAudience,
    issuer: config.supabaseJwtIssuer,
    jwksUrl: config.supabaseJwksUrl
  },
  logger
);
const authService = new AuthService(tokenVerifier, authRepository, logger, {
  defaultRoleCode: config.defaultAdminRoleCode,
  superAdminEmails: config.superAdminEmails
});

// ─── Audit (must be created before UserService as it is a dependency) ─────────
const auditRepository = new PrismaAuditRepository(prisma);
const auditService = new AuditService(auditRepository, authService, logger);

// ─── Roles ────────────────────────────────────────────────────────────────────
const roleRepository = new PrismaRoleRepository(prisma);
const roleService = new RoleService(roleRepository, authService);

// ─── Users ────────────────────────────────────────────────────────────────────
const userRepository = new PrismaUserRepository(prisma);
const userService = new UserService(userRepository, authService, auditService);

// ─── Call Records (Admin) ───────────────────────────────────────────────────────
const callRepository = new PrismaCallRepository(prisma);
const callService = new CallService(callRepository, authService);

// ─── Ticket Management (Admin) ──────────────────────────────────────────────────────
const ticketRepository = new PrismaTicketRepository(prisma);
const ticketService = new TicketService(ticketRepository, authService, auditService);

// ─── Devices & Push Notifications (Admin) ──────────────────────────────────────
const deviceRepository = new PrismaDeviceRepository(prisma);
const deviceService = new DeviceService(deviceRepository, logger);
const pushNotificationService = new PushNotificationService(deviceRepository, logger);

// ─── Analytics (Admin) ──────────────────────────────────────────────────────────
const analyticsService = new AnalyticsService(prisma, authService);

// ─── Notifications (Admin) ──────────────────────────────────────────────────────
const notificationRepository = new NotificationRepository(prisma);
const notificationService = new NotificationService(
  notificationRepository,
  pushNotificationService,
  authService,
  prisma
);

// ─── Hydration Core (Admin) ───────────────────────────────────────────────────
const hydrationService = new HydrationService(callRepository, ticketRepository, authService);

// ─── Knowledge Base ───────────────────────────────────────────────────────────
const geminiService = new GeminiService(config);
const documentParser = new DocumentParserService();
const knowledgeRepository = new KnowledgeRepository(prisma);
const knowledgeService = new KnowledgeService(
  knowledgeRepository,
  documentParser,
  geminiService,
  authService,
  auditService
);

// ─── Health ───────────────────────────────────────────────────────────────────
const healthService = new HealthService(config, [
  {
    name: "database",
    check: async () => prisma.checkReadiness()
  }
]);

// ─── Voice & Grounding Core ───────────────────────────────────────────────────
const voiceRepository = new PrismaVoiceRepository(prisma);
const voiceService = new VoiceService(config, logger, voiceRepository);
const callSessionService = new CallSessionService();
const groundingEngine = new GroundingEngine(knowledgeService, geminiService);
const speechService = new SpeechService(config);

// ─── Express App & HTTP Server ────────────────────────────────────────────────
const app = createApp({
  env: config,
  logger,
  healthService,
  voiceService,
  authService,
  userService,
  roleService,
  auditService,
  knowledgeService,
  callSessionService,
  groundingEngine,
  callService,
  ticketService,
  deviceService,
  hydrationService,
  analyticsService,
  notificationService
});

const server = createServer(app);
const voiceStreamGateway = new VoiceStreamGateway(
  config,
  logger,
  callSessionService,
  groundingEngine,
  speechService,
  voiceRepository,
  notificationService
);
voiceStreamGateway.attach(server);

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Received shutdown signal");

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await voiceStreamGateway.close();
  await prisma.$disconnect();
  logger.info("Shutdown completed");
  process.exit(0);
};

server.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      environment: config.nodeEnv
    },
    "Bharat Voice backend is listening"
  );
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
