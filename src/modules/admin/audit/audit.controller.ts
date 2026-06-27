/**
 * audit.controller.ts
 *
 * HTTP controller for the Audit Log API.
 *
 * Endpoints:
 *   GET /admin/audit-logs   — paginated list with optional filters
 *
 * All endpoints require a valid authenticated admin user attached to request.authUser
 * by the requireAuth middleware upstream.
 */

import type { Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error";
import type { AuditService } from "./audit.service";
import type { ListAuditLogsQuery } from "./audit.schemas";

export class AuditController {
  public constructor(private readonly auditService: AuditService) {}

  /**
   * GET /admin/audit-logs
   *
   * Returns a paginated list of audit log entries with optional filters.
   */
  public list = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    // validateQuery middleware stores the parsed result on a custom key
    const query = (request as Request & { parsedQuery: ListAuditLogsQuery }).parsedQuery;
    const result = await this.auditService.listAuditLogs(request.authUser, query);

    response.status(200).json(result);
  };
}
