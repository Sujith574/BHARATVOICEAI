/**
 * ticket.repository.ts
 *
 * Data-access layer for Ticket records.
 *
 * Responsibilities:
 *  - Paginated ticket listing with optional filters.
 *  - Single-ticket fetch.
 *  - Ticket mutation (status update, owner assignment).
 */

import type { Prisma } from "@prisma/client";

import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { PaginationQuery } from "../../../shared/pagination/pagination";
import { buildPrismaSkipTake } from "../../../shared/pagination/pagination";
import type { ListTicketsQuery, TicketResponse, UpdateTicketBody } from "./ticket.schemas";

// ─── Mapper ───────────────────────────────────────────────────────────────────

const mapTicket = (ticket: Prisma.TicketGetPayload<Record<string, never>>): TicketResponse => ({
  id: ticket.id,
  callId: ticket.callId,
  departmentId: ticket.departmentId,
  assignedToUserId: ticket.assignedToUserId,
  title: ticket.title,
  description: ticket.description,
  priority: ticket.priority,
  status: ticket.status,
  createdAt: ticket.createdAt.toISOString(),
  updatedAt: ticket.updatedAt.toISOString(),
  resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
});

// ─── Repository Interface ─────────────────────────────────────────────────────

export interface TicketRepository {
  findMany(
    filters: Omit<ListTicketsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: TicketResponse[]; total: number }>;

  findById(ticketId: string): Promise<TicketResponse | null>;

  update(ticketId: string, body: UpdateTicketBody): Promise<TicketResponse>;

  countPending(): Promise<number>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaTicketRepository implements TicketRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findMany(
    filters: Omit<ListTicketsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: TicketResponse[]; total: number }> {
    const where: Prisma.TicketWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.callId) {
      where.callId = filters.callId;
    }

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters.fromDate ?? filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.createdAt.lte = new Date(filters.toDate);
      }
    }

    const [tickets, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...buildPrismaSkipTake(pagination),
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data: tickets.map(mapTicket), total };
  }

  public async findById(ticketId: string): Promise<TicketResponse | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    return ticket ? mapTicket(ticket) : null;
  }

  public async update(ticketId: string, body: UpdateTicketBody): Promise<TicketResponse> {
    const data: Prisma.TicketUpdateInput = {};

    if (body.status !== undefined) {
      data.status = body.status;
      // Mark resolvedAt when transitioning to a terminal state
      if (body.status === "RESOLVED" || body.status === "CLOSED") {
        data.resolvedAt = new Date();
      }
    }

    if (body.assignedToUserId !== undefined) {
      data.assignedToUser = body.assignedToUserId
        ? { connect: { id: body.assignedToUserId } }
        : { disconnect: true };
    }

    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data,
    });

    return mapTicket(ticket);
  }

  public async countPending(): Promise<number> {
    return this.prisma.ticket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] }
      }
    });
  }
}
