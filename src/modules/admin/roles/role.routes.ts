/**
 * role.routes.ts
 *
 * Express router for the Roles API.
 * All routes require authentication.
 *
 * Mount point: /api/v1/admin/roles
 */

import { Router } from "express";

import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateQuery } from "../../../shared/http/validate-request";
import type { RoleController } from "./role.controller";
import { listRolesQuerySchema } from "./role.schemas";

export const createRoleRouter = (authService: AuthService, controller: RoleController): Router => {
  const router = Router();

  /**
   * GET /admin/roles
   * Permission: platform.roles.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listRolesQuerySchema),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    }
  );

  /**
   * GET /admin/roles/:id
   * Permission: platform.roles.read
   */
  router.get(
    "/:id",
    requireAuth(authService),
    (req, res, next) => {
      controller.getById(req, res).catch(next);
    }
  );

  return router;
};
