import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import type { Logger } from "pino";

import type { AppConfig } from "../config/env";
import { AdminSessionController } from "../modules/admin/admin-session.controller";
import { createAdminRouter } from "../modules/admin/admin.routes";
import { AuditController } from "../modules/admin/audit/audit.controller";
import type { AuditService } from "../modules/admin/audit/audit.service";
import { CallController } from "../modules/admin/calls/call.controller";
import type { CallService } from "../modules/admin/calls/call.service";
import { RoleController } from "../modules/admin/roles/role.controller";
import type { RoleService } from "../modules/admin/roles/role.service";
import { TicketController } from "../modules/admin/tickets/ticket.controller";
import type { TicketService } from "../modules/admin/tickets/ticket.service";
import { UserController } from "../modules/admin/users/user.controller";
import type { UserService } from "../modules/admin/users/user.service";
import { DeviceController } from "../modules/admin/devices/device.controller";
import type { DeviceService } from "../modules/admin/devices/device.service";
import { HydrationController } from "../modules/admin/hydration/hydration.controller";
import type { HydrationService } from "../modules/admin/hydration/hydration.service";
import { AuthController } from "../modules/auth/auth.controller";
import { createAuthRouter } from "../modules/auth/auth.routes";
import type { AuthService } from "../modules/auth/auth.service";
import { KnowledgeController } from "../modules/knowledge/knowledge.controller";
import type { KnowledgeService } from "../modules/knowledge/knowledge.service";
import { HealthController } from "../modules/health/health.controller";
import type { HealthService } from "../modules/health/health.service";
import { createHealthRouter } from "../modules/health/health.routes";
import { VoiceController } from "../modules/voice/voice.controller";
import { createVoiceRouter } from "../modules/voice/voice.routes";
import type { VoiceService } from "../modules/voice/voice.service";
import type { CallSessionService } from "../modules/voice/call-session.service";
import type { GroundingEngine } from "../modules/ai/grounding.engine";
import { createErrorHandler } from "../shared/http/error-handler";
import { notFoundHandler } from "../shared/http/not-found-handler";
import { requestContextMiddleware } from "../shared/http/request-context";
import { AnalyticsController } from "../modules/admin/analytics/analytics.controller";
import type { AnalyticsService } from "../modules/admin/analytics/analytics.service";
import { NotificationController } from "../modules/admin/notifications/notification.controller";
import type { NotificationService } from "../modules/admin/notifications/notification.service";

export interface ApplicationDependencies {
  env: AppConfig;
  logger: Logger;
  healthService: HealthService;
  voiceService: VoiceService;
  authService: AuthService;
  userService: UserService;
  roleService: RoleService;
  auditService: AuditService;
  knowledgeService: KnowledgeService;
  callSessionService: CallSessionService;
  groundingEngine: GroundingEngine;
  callService: CallService;
  ticketService: TicketService;
  deviceService: DeviceService;
  hydrationService: HydrationService;
  analyticsService: AnalyticsService;
  notificationService: NotificationService;
}

const buildCorsOrigin = (origins: string[]): cors.CorsOptions["origin"] => {
  if (origins.includes("*")) {
    return true;
  }

  return origins;
};

export const createApp = (dependencies: ApplicationDependencies): Express => {
  const app = express();

  // ─── Controllers ──────────────────────────────────────────────────────────────
  const adminSessionController = new AdminSessionController();
  const authController = new AuthController(dependencies.authService);
  const healthController = new HealthController(dependencies.healthService);
  const voiceController = new VoiceController(dependencies.voiceService);
  const userController = new UserController(dependencies.userService);
  const roleController = new RoleController(dependencies.roleService);
  const auditController = new AuditController(dependencies.auditService);
  const knowledgeController = new KnowledgeController(dependencies.knowledgeService);
  const callController = new CallController(dependencies.callService);
  const ticketController = new TicketController(dependencies.ticketService);
  const deviceController = new DeviceController(dependencies.deviceService);
  const hydrationController = new HydrationController(dependencies.hydrationService);
  const analyticsController = new AnalyticsController(dependencies.analyticsService);
  const notificationController = new NotificationController(dependencies.notificationService);

  // ─── Rate Limiter ─────────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: dependencies.env.rateLimitWindowMs,
    limit: dependencies.env.rateLimitMaxRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (request) =>
      request.path.startsWith(`${dependencies.env.apiPrefix}/voice/`) ||
      request.path.startsWith(`${dependencies.env.apiPrefix}/health/`)
  });

  // ─── App Config ───────────────────────────────────────────────────────────────
  app.set("trust proxy", dependencies.env.trustProxyHops);
  app.disable("x-powered-by");

  // ─── Global Middleware ────────────────────────────────────────────────────────
  app.use(requestContextMiddleware);
  app.use(
    pinoHttp({
      logger: dependencies.logger,
      genReqId: (request, response) => {
        const existing = request.headers["x-request-id"];
        const requestId = typeof existing === "string" && existing.length > 0 ? existing : response.getHeader("x-request-id");
        return String(requestId);
      }
    })
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(compression());
  app.use(
    cors({
      origin: buildCorsOrigin(dependencies.env.corsOrigins)
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(limiter);

  // ─── Routes ───────────────────────────────────────────────────────────────────
  app.use(`${dependencies.env.apiPrefix}/health`, createHealthRouter(healthController));
  app.use(`${dependencies.env.apiPrefix}/auth`, createAuthRouter(dependencies.authService, authController));
  app.use(
    `${dependencies.env.apiPrefix}/admin`,
    createAdminRouter({
      authService: dependencies.authService,
      sessionController: adminSessionController,
      userController,
      roleController,
      auditController,
      knowledgeController,
      callController,
      ticketController,
      deviceController,
      hydrationController,
      analyticsController,
      notificationController,
    })
  );
  app.use(`${dependencies.env.apiPrefix}/voice`, createVoiceRouter(dependencies.env, voiceController));

  // ─── Error Handling ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(createErrorHandler(dependencies.logger));

  return app;
};
