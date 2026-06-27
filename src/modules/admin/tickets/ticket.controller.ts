/**
 * ticket.controller.ts
 *
 * HTTP controller for the Ticket Management API.
 *
 * Endpoints:
 *   GET   /admin/tickets         — paginated ticket list
 *   GET   /admin/tickets/:id     — single ticket detail
 *   PATCH /admin/tickets/:id     — update ticket status / assigned owner
 *
 * All endpoints require authentication (enforced via requireAuth middleware in routes).
 */

import type { Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error";
import type { TicketService } from "./ticket.service";
import type { ListTicketsQuery, UpdateTicketBody } from "./ticket.schemas";

export class TicketController {
  public constructor(private readonly ticketService: TicketService) {}

  /**
   * GET /admin/tickets
   */
  public list = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const query = (request as Request & { parsedQuery: ListTicketsQuery }).parsedQuery;
    const result = await this.ticketService.listTickets(request.authUser, query);

    response.status(200).json(result);
  };

  /**
   * GET /admin/tickets/:id
   */
  public getById = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const ticket = await this.ticketService.getTicketById(
      request.authUser,
      String(request.params["id"])
    );

    response.status(200).json({ data: ticket });
  };

  /**
   * PATCH /admin/tickets/:id
   */
  public update = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const body = request.body as UpdateTicketBody;
    const context = this.extractRequestContext(request);
    const updated = await this.ticketService.updateTicket(
      request.authUser,
      String(request.params["id"]),
      body,
      context
    );

    response.status(200).json({ data: updated });
  };

  /** Extract audit-relevant fields from the incoming request. */
  private extractRequestContext(request: Request): {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  } {
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];
    const requestId = request.headers["x-request-id"];
    return {
      ...(ipAddress !== undefined && { ipAddress }),
      ...(typeof userAgent === "string" && { userAgent }),
      ...(typeof requestId === "string" && { requestId }),
    };
  }
}
