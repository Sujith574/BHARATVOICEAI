/**
 * audit.service.ts
 *
 * Business logic layer for audit operations.
 *
 * Dual purpose:
 *  1. READ  — Paginated, filterable audit log retrieval for the admin API.
 *  2. WRITE — `log()` method is a shared helper imported by all other services
 *             (UserService, RoleService, etc.) to write audit entries without
 *             coupling them directly to the repository.
 *
 * Dependencies:
 *  - AuditRepository — data access
 *  - AuthService     — permission enforcement for read operations
 */

import type { Logger } from "pino";

import { buildPaginationMeta, type PaginationMeta } from "../../../shared/pagination/pagination";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { WriteAuditLogDto, AuditRepository } from "./audit.repository";
import type { AuditLogResponse, ListAuditLogsQuery } from "./audit.schemas";

export interface AuditLogListResult {
  data: AuditLogResponse[];
  meta: PaginationMeta;
}

export class AuditService {
  public constructor(
    private readonly repository: AuditRepository,
    private readonly authService: AuthService,
    private readonly logger: Logger
  ) {}

  /**
   * Write an audit log entry.
   * Non-throwing — logs errors internally so callers are never blocked by audit failures.
   */
  public async log(dto: WriteAuditLogDto): Promise<void> {
    try {
      await this.repository.write(dto);
    } catch (error) {
      this.logger.error({ err: error, dto }, "Failed to write audit log entry");
    }
  }

  /**
   * Retrieve a paginated, optionally filtered list of audit log entries.
   * Requires the `audit.read` permission.
   */
  public async listAuditLogs(actor: AuthenticatedUser, query: ListAuditLogsQuery): Promise<AuditLogListResult> {
    this.authService.assertPermission(actor, "audit.read");

    const { page, pageSize, ...filters } = query;
    const { data, total } = await this.repository.findMany(filters, { page, pageSize });

    this.logger.debug(
      { actorId: actor.id, total, page, pageSize },
      "Audit log list retrieved"
    );

    return {
      data,
      meta: buildPaginationMeta(total, { page, pageSize })
    };
  }
}
