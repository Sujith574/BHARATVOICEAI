/**
 * user.routes.ts
 *
 * Express router for the User Management API.
 * All routes require authentication + appropriate permissions (enforced in UserService).
 *
 * Mount point: /api/v1/admin/users
 */

import { Router } from "express";

import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateBody, validateQuery } from "../../../shared/http/validate-request";
import type { UserController } from "./user.controller";
import { assignRoleBodySchema, listUsersQuerySchema, updateUserStatusBodySchema } from "./user.schemas";

export const createUserRouter = (authService: AuthService, controller: UserController): Router => {
  const router = Router();

  /**
   * GET /admin/users
   * Permission: platform.users.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listUsersQuerySchema),
    (req, res, next) => { controller.list(req, res).catch(next); }
  );

  /**
   * GET /admin/users/:id
   * Permission: platform.users.read
   */
  router.get(
    "/:id",
    requireAuth(authService),
    (req, res, next) => { controller.getById(req, res).catch(next); }
  );

  /**
   * PATCH /admin/users/:id/status
   * Permission: platform.users.manage
   */
  router.patch(
    "/:id/status",
    requireAuth(authService),
    validateBody(updateUserStatusBodySchema),
    (req, res, next) => { controller.updateStatus(req, res).catch(next); }
  );

  /**
   * POST /admin/users/:id/roles
   * Permission: platform.users.manage
   */
  router.post(
    "/:id/roles",
    requireAuth(authService),
    validateBody(assignRoleBodySchema),
    (req, res, next) => { controller.assignRole(req, res).catch(next); }
  );

  /**
   * DELETE /admin/users/:id/roles/:userRoleId
   * Permission: platform.users.manage
   */
  router.delete(
    "/:id/roles/:userRoleId",
    requireAuth(authService),
    (req, res, next) => { controller.removeRole(req, res).catch(next); }
  );

  return router;
};
