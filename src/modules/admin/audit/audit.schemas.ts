/**
 * audit.schemas.ts
 *
 * Zod schemas for the Audit Log REST API.
 * Used for query validation and typed API responses.
 */

import { z } from "zod";

import { paginationQuerySchema } from "../../../shared/pagination/pagination";

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  /** Filter by the actor (user who performed the action) */
  actorUserId: z.string().uuid().optional(),
  /** Filter by the subject user */
  subjectUserId: z.string().uuid().optional(),
  /** Filter by entity type (e.g. "USER", "KNOWLEDGE_DOCUMENT") */
  entityType: z.string().max(120).optional(),
  /** Filter by action code (e.g. "AUTH_USER_PROVISIONED") */
  action: z.string().max(120).optional(),
  /** ISO 8601 datetime — return entries at or after this time */
  fromDate: z.string().datetime({ offset: true }).optional(),
  /** ISO 8601 datetime — return entries at or before this time */
  toDate: z.string().datetime({ offset: true }).optional()
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

// ─── Response Shapes ───────────────────────────────────────────────────────────

export interface AuditLogResponse {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  subjectUserId: string | null;
  subjectEmail: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}
