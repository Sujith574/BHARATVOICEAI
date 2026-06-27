/**
 * ticket.service.ts
 *
 * Business logic layer for the Ticket Management API.
 *
 * Responsibilities:
 *  - Enforce RBAC permission checks before each operation.
 *  - Write audit log entries on every status mutation.
 *  - Delegate data access to TicketRepository.
 *
 * Dependencies:
 *  - TicketRepository — data access
 *  - AuthService      — permission enforcement
 *  - AuditService     — audit logging
 */

import { AppError } from "../../../shared/errors/app-error";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/pagination/pagination";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { AuditService } from "../audit/audit.service";
import type { TicketRepository } from "./ticket.repository";
import type { ListTicketsQuery, TicketResponse, UpdateTicketBody } from "./ticket.schemas";

export interface TicketListResult {
  data: TicketResponse[];
  meta: PaginationMeta;
}

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export class TicketService {
  public constructor(
    private readonly repository: TicketRepository,
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  /**
   * List tickets with pagination and optional filters.
   * Requires: tickets.read
   */
  public async listTickets(actor: AuthenticatedUser, query: ListTicketsQuery): Promise<TicketListResult> {
    this.authService.assertPermission(actor, "tickets.read");

    const { page, pageSize, ...filters } = query;
    const { data, total } = await this.repository.findMany(filters, { page, pageSize });

    return {
      data,
      meta: buildPaginationMeta(total, { page, pageSize }),
    };
  }

  /**
   * Get a single ticket by its UUID.
   * Requires: tickets.read
   */
  public async getTicketById(actor: AuthenticatedUser, ticketId: string): Promise<TicketResponse> {
    this.authService.assertPermission(actor, "tickets.read");

    const ticket = await this.repository.findById(ticketId);

    if (!ticket) {
      throw new AppError(404, "TICKET_NOT_FOUND", `Ticket with ID '${ticketId}' was not found.`);
    }

    return ticket;
  }

  /**
   * Update a ticket's status and/or assigned owner.
   * Requires: tickets.manage
   * Side effect: writes an audit log entry for every mutation.
   */
  public async updateTicket(
    actor: AuthenticatedUser,
    ticketId: string,
    body: UpdateTicketBody,
    context: RequestContext = {}
  ): Promise<TicketResponse> {
    this.authService.assertPermission(actor, "tickets.manage");

    // Verify the ticket exists before mutating
    const existing = await this.repository.findById(ticketId);
    if (!existing) {
      throw new AppError(404, "TICKET_NOT_FOUND", `Ticket with ID '${ticketId}' was not found.`);
    }

    const updated = await this.repository.update(ticketId, body);

    await this.auditService.log({
      actorUserId: actor.id,
      entityType: "TICKET",
      entityId: ticketId,
      action: "TICKET_UPDATED",
      metadata: {
        previousStatus: existing.status,
        newStatus: body.status ?? existing.status,
        assignedToUserId: body.assignedToUserId ?? existing.assignedToUserId,
      },
      ...context,
    });

    return updated;
  }
}
