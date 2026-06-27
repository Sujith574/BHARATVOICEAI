/**
 * audit.routes.ts
 *
 * Express router for the Audit Log API.
 * All routes require authentication. Query parameters are Zod-validated.
 *
 * Mount point: /api/v1/admin/audit-logs
 */

import { Router } from "express";

import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateQuery } from "../../../shared/http/validate-request";
import type { AuditController } from "./audit.controller";
import { listAuditLogsQuerySchema } from "./audit.schemas";

export const createAuditRouter = (authService: AuthService, controller: AuditController): Router => {
  const router = Router();

  /**
   * GET /admin/audit-logs
   * Permission: audit.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listAuditLogsQuerySchema),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    }
  );

  return router;
};
