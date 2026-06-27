/**
 * ticket.schemas.ts
 *
 * Zod schemas and TypeScript response types for the Ticket Management API.
 *
 * Covers:
 *  - Listing tickets (with pagination + filters)
 *  - Updating ticket status and owner assignment
 *  - API response shape
 */

import { z } from "zod";

import { paginationQuerySchema } from "../../../shared/pagination/pagination";

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  /** Filter by ticket status */
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  /** Filter by ticket priority */
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  /** Filter by the call that originated this ticket */
  callId: z.string().uuid().optional(),
  /** Filter by department */
  departmentId: z.string().uuid().optional(),
  /** ISO 8601 date-time — return tickets created at or after this timestamp */
  fromDate: z.string().datetime({ offset: true }).optional(),
  /** ISO 8601 date-time — return tickets created at or before this timestamp */
  toDate: z.string().datetime({ offset: true }).optional(),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────

export const updateTicketBodySchema = z.object({
  /** New status for this ticket */
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  /** UUID of the admin user to assign this ticket to */
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>;

// ─── Response Shape ────────────────────────────────────────────────────────────

export interface TicketResponse {
  id: string;
  callId: string | null;
  departmentId: string | null;
  assignedToUserId: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}
