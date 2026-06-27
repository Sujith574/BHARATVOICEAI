/**
 * call.repository.ts
 *
 * Data-access layer for Call and ConversationHistory records (read-only).
 *
 * Responsibilities:
 *  - Paginated call listing with optional filters.
 *  - Single-call fetch with full conversation transcript embedded.
 *
 * This repository is intentionally read-only — write operations are handled
 * by VoiceRepository in the voice module (which is called during live calls).
 */

import type { Prisma } from "@prisma/client";

import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { PaginationQuery } from "../../../shared/pagination/pagination";
import { buildPrismaSkipTake } from "../../../shared/pagination/pagination";
import type {
  CallDetailResponse,
  CallResponse,
  ConversationTurnResponse,
  ListCallsQuery,
} from "./call.schemas";

// ─── Internal Prisma include shapes ───────────────────────────────────────────

const callInclude = {} satisfies Prisma.CallInclude;

const callDetailInclude = {
  conversationEntries: {
    orderBy: { turnIndex: "asc" as const },
  },
} satisfies Prisma.CallInclude;

type CallRecord = Prisma.CallGetPayload<{ include: typeof callInclude }>;
type CallDetailRecord = Prisma.CallGetPayload<{ include: typeof callDetailInclude }>;

// ─── Mappers ──────────────────────────────────────────────────────────────────

const mapTurn = (turn: CallDetailRecord["conversationEntries"][number]): ConversationTurnResponse => ({
  id: turn.id,
  turnIndex: turn.turnIndex,
  speakerRole: turn.speakerRole,
  languageCode: turn.languageCode,
  content: turn.content,
  confidenceScore: turn.confidenceScore,
  createdAt: turn.createdAt.toISOString(),
});

const mapCall = (call: CallRecord): CallResponse => ({
  id: call.id,
  twilioCallSid: call.twilioCallSid,
  callerPhoneNumber: call.callerPhoneNumber,
  languageCode: call.languageCode,
  status: call.status,
  escalated: call.escalated,
  startedAt: call.startedAt?.toISOString() ?? null,
  connectedAt: call.connectedAt?.toISOString() ?? null,
  endedAt: call.endedAt?.toISOString() ?? null,
  durationSeconds: call.durationSeconds,
  confidenceScore: call.confidenceScore,
  assignedDepartmentId: call.assignedDepartmentId,
  createdAt: call.createdAt.toISOString(),
  updatedAt: call.updatedAt.toISOString(),
});

const mapCallDetail = (call: CallDetailRecord): CallDetailResponse => ({
  ...mapCall(call),
  conversationEntries: call.conversationEntries.map(mapTurn),
});

// ─── Repository Interface ─────────────────────────────────────────────────────

export interface CallRepository {
  findMany(
    filters: Omit<ListCallsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: CallResponse[]; total: number }>;

  findById(callId: string): Promise<CallDetailResponse | null>;

  countActive(): Promise<number>;

  countEscalated(): Promise<number>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaCallRepository implements CallRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findMany(
    filters: Omit<ListCallsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: CallResponse[]; total: number }> {
    const where: Prisma.CallWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.languageCode) {
      where.languageCode = filters.languageCode;
    }

    if (filters.fromDate ?? filters.toDate) {
      where.startedAt = {};
      if (filters.fromDate) {
        where.startedAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.startedAt.lte = new Date(filters.toDate);
      }
    }

    const [calls, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({
        where,
        include: callInclude,
        orderBy: { createdAt: "desc" },
        ...buildPrismaSkipTake(pagination),
      }),
      this.prisma.call.count({ where }),
    ]);

    return { data: calls.map(mapCall), total };
  }

  public async findById(callId: string): Promise<CallDetailResponse | null> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: callDetailInclude,
    });

    return call ? mapCallDetail(call) : null;
  }

  public async countActive(): Promise<number> {
    return this.prisma.call.count({
      where: {
        status: { in: ["INITIATED", "RINGING", "IN_PROGRESS"] }
      }
    });
  }

  public async countEscalated(): Promise<number> {
    return this.prisma.call.count({
      where: { escalated: true }
    });
  }
}
