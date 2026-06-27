/**
 * audit.repository.ts
 *
 * Data-access layer for AuditLog records.
 *
 * Responsibilities:
 *  - Paginated retrieval of audit logs with optional filters.
 *  - Writing new audit log entries (used as a shared helper by all modules).
 *
 * This repository is the single point of contact with the `audit_logs` table.
 */

import { Prisma } from "@prisma/client";

import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { PaginationQuery } from "../../../shared/pagination/pagination";
import { buildPrismaSkipTake } from "../../../shared/pagination/pagination";
import type { AuditLogResponse, ListAuditLogsQuery } from "./audit.schemas";

// ─── Write DTO ────────────────────────────────────────────────────────────────

export interface WriteAuditLogDto {
  actorUserId?: string | null;
  subjectUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

// ─── Repository Interface ──────────────────────────────────────────────────────

export interface AuditRepository {
  write(dto: WriteAuditLogDto): Promise<void>;
  findMany(
    filters: Omit<ListAuditLogsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: AuditLogResponse[]; total: number }>;
}

// ─── Prisma implementation ────────────────────────────────────────────────────

const mapLog = (
  log: Prisma.AuditLogGetPayload<{
    include: { actorUser: true; subjectUser: true };
  }>
): AuditLogResponse => ({
  id: log.id,
  actorUserId: log.actorUserId,
  actorEmail: log.actorUser?.email ?? null,
  subjectUserId: log.subjectUserId,
  subjectEmail: log.subjectUser?.email ?? null,
  entityType: log.entityType,
  entityId: log.entityId,
  action: log.action,
  metadata: log.metadata,
  ipAddress: log.ipAddress,
  userAgent: log.userAgent,
  requestId: log.requestId,
  createdAt: log.createdAt.toISOString()
});

export class PrismaAuditRepository implements AuditRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async write(dto: WriteAuditLogDto): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: dto.actorUserId ?? null,
        subjectUserId: dto.subjectUserId ?? null,
        entityType: dto.entityType,
        entityId: dto.entityId ?? null,
        action: dto.action,
        // Prisma's nullable Json field requires either a value or Prisma.JsonNull
        metadata: dto.metadata !== undefined ? (dto.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        requestId: dto.requestId ?? null
      }
    });
  }

  public async findMany(
    filters: Omit<ListAuditLogsQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: AuditLogResponse[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.actorUserId) {
      where.actorUserId = filters.actorUserId;
    }

    if (filters.subjectUserId) {
      where.subjectUserId = filters.subjectUserId;
    }

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.action) {
      where.action = filters.action;
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

    const include = { actorUser: true, subjectUser: true } satisfies Prisma.AuditLogInclude;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        ...buildPrismaSkipTake(pagination)
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return { data: data.map(mapLog), total };
  }
}
