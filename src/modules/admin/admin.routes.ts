/**
 * admin.routes.ts
 *
 * Root router for all admin API endpoints.
 *
 * Sub-routes:
 *   GET  /admin/session      — authenticated session info (existing)
 *   GET  /admin/me           — current user profile + roles
 *   /admin/users/**          — user management
 *   /admin/roles/**          — role listing
 *   /admin/audit-logs/**     — audit log access
 *
 * Mount point: /api/v1/admin
 */

import { Router } from "express";

import { createRequirePermission, createRequireProvisionedUser } from "../auth/auth.middleware";
import type { AuthService } from "../auth/auth.service";
import type { AdminSessionController } from "./admin-session.controller";
import type { AuditController } from "./audit/audit.controller";
import { createAuditRouter } from "./audit/audit.routes";
import type { CallController } from "./calls/call.controller";
import { createCallRouter } from "./calls/call.routes";
import type { RoleController } from "./roles/role.controller";
import { createRoleRouter } from "./roles/role.routes";
import type { TicketController } from "./tickets/ticket.controller";
import { createTicketRouter } from "./tickets/ticket.routes";
import type { UserController } from "./users/user.controller";
import { createUserRouter } from "./users/user.routes";
import type { KnowledgeController } from "../knowledge/knowledge.controller";
import { createKnowledgeRouter } from "../knowledge/knowledge.routes";
import type { DeviceController } from "./devices/device.controller";
import { createDeviceRouter } from "./devices/device.routes";
import type { HydrationController } from "./hydration/hydration.controller";
import { createHydrationRouter } from "./hydration/hydration.routes";
import type { AnalyticsController } from "./analytics/analytics.controller";
import { createAnalyticsRouter } from "./analytics/analytics.routes";
import type { NotificationController } from "./notifications/notification.controller";
import { createNotificationRouter } from "./notifications/notification.routes";

export interface AdminRouterDependencies {
  authService: AuthService;
  sessionController: AdminSessionController;
  userController: UserController;
  roleController: RoleController;
  auditController: AuditController;
  knowledgeController: KnowledgeController;
  callController: CallController;
  ticketController: TicketController;
  deviceController: DeviceController;
  hydrationController: HydrationController;
  analyticsController: AnalyticsController;
  notificationController: NotificationController;
}

export const createAdminRouter = (deps: AdminRouterDependencies): Router => {
  const router = Router();

  /**
   * GET /admin/session
   * Returns identity + authUser context (used for debug / auth verification)
   */
  router.get(
    "/session",
    createRequireProvisionedUser(deps.authService),
    createRequirePermission(deps.authService, "mobile.dashboard.read"),
    deps.sessionController.getSession
  );

  /**
   * GET /admin/me
   * Returns the fully hydrated authenticated user profile with roles + permissions.
   */
  router.get(
    "/me",
    createRequireProvisionedUser(deps.authService),
    deps.sessionController.getMe
  );

  /**
   * /admin/users/**
   */
  router.use("/users", createUserRouter(deps.authService, deps.userController));

  /**
   * /admin/roles/**
   */
  router.use("/roles", createRoleRouter(deps.authService, deps.roleController));

  /**
   * /admin/audit-logs/**
   */
  router.use("/audit-logs", createAuditRouter(deps.authService, deps.auditController));

  /**
   * /admin/knowledge/**
   */
  router.use("/knowledge", createKnowledgeRouter(deps.authService, deps.knowledgeController));

  /**
   * /admin/calls/**
   */
  router.use("/calls", createCallRouter(deps.authService, deps.callController));

  /**
   * /admin/tickets/**
   */
  router.use("/tickets", createTicketRouter(deps.authService, deps.ticketController));

  /**
   * /admin/devices/**
   */
  router.use("/devices", createDeviceRouter(deps.authService, deps.deviceController));

  /**
   * /admin/mobile/**
   */
  router.use("/mobile", createHydrationRouter(deps.authService, deps.hydrationController));

  /**
   * /admin/analytics/**
   */
  router.use("/analytics", createAnalyticsRouter(deps.authService, deps.analyticsController));

  /**
   * /admin/notifications/**
   */
  router.use("/notifications", createNotificationRouter(deps.authService, deps.notificationController));

  return router;
};
