/**
 * call.routes.ts
 *
 * Express router for the Call Records API.
 *
 * Mount point: /api/v1/admin/calls
 */

import { Router } from "express";

import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateQuery } from "../../../shared/http/validate-request";
import type { CallController } from "./call.controller";
import { listCallsQuerySchema } from "./call.schemas";

export const createCallRouter = (authService: AuthService, controller: CallController): Router => {
  const router = Router();

  /**
   * GET /admin/calls
   * Permission: calls.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listCallsQuerySchema),
    (req, res, next) => { controller.list(req, res).catch(next); }
  );

  /**
   * GET /admin/calls/:id
   * Permission: calls.read
   */
  router.get(
    "/:id",
    requireAuth(authService),
    (req, res, next) => { controller.getById(req, res).catch(next); }
  );

  return router;
};
