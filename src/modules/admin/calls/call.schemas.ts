/**
 * call.schemas.ts
 *
 * Zod schemas and TypeScript response types for the Call Records API.
 *
 * Covers:
 *  - Listing calls (with pagination + filters)
 *  - Single call detail with embedded conversation transcript
 */

import { z } from "zod";

import { paginationQuerySchema } from "../../../shared/pagination/pagination";

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const listCallsQuerySchema = paginationQuerySchema.extend({
  /** Filter by call status */
  status: z
    .enum(["INITIATED", "RINGING", "IN_PROGRESS", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CANCELED"])
    .optional(),
  /** Filter by language code (e.g. en-IN, hi-IN) */
  languageCode: z.string().max(16).optional(),
  /** ISO 8601 date-time — return calls started at or after this timestamp */
  fromDate: z.string().datetime({ offset: true }).optional(),
  /** ISO 8601 date-time — return calls started at or before this timestamp */
  toDate: z.string().datetime({ offset: true }).optional(),
});

export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;

// ─── Response Shapes ───────────────────────────────────────────────────────────

export interface ConversationTurnResponse {
  id: string;
  turnIndex: number;
  speakerRole: string;
  languageCode: string | null;
  content: string;
  confidenceScore: number | null;
  createdAt: string;
}

export interface CallResponse {
  id: string;
  twilioCallSid: string;
  callerPhoneNumber: string | null;
  languageCode: string | null;
  status: string;
  escalated: boolean;
  startedAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  confidenceScore: number | null;
  assignedDepartmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallDetailResponse extends CallResponse {
  /** Full ordered conversation transcript for this call */
  conversationEntries: ConversationTurnResponse[];
}
