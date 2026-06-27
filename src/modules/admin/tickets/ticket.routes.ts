/**
 * ticket.routes.ts
 *
 * Express router for the Ticket Management API.
 *
 * Mount point: /api/v1/admin/tickets
 */

import { Router } from "express";

import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateBody, validateQuery } from "../../../shared/http/validate-request";
import type { TicketController } from "./ticket.controller";
import { listTicketsQuerySchema, updateTicketBodySchema } from "./ticket.schemas";

export const createTicketRouter = (authService: AuthService, controller: TicketController): Router => {
  const router = Router();

  /**
   * GET /admin/tickets
   * Permission: tickets.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listTicketsQuerySchema),
    (req, res, next) => { controller.list(req, res).catch(next); }
  );

  /**
   * GET /admin/tickets/:id
   * Permission: tickets.read
   */
  router.get(
    "/:id",
    requireAuth(authService),
    (req, res, next) => { controller.getById(req, res).catch(next); }
  );

  /**
   * PATCH /admin/tickets/:id
   * Permission: tickets.manage
   */
  router.patch(
    "/:id",
    requireAuth(authService),
    validateBody(updateTicketBodySchema),
    (req, res, next) => { controller.update(req, res).catch(next); }
  );

  return router;
};
