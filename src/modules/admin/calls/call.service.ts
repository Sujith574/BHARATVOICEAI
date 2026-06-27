/**
 * call.service.ts
 *
 * Business logic layer for the Call Records API.
 *
 * Responsibilities:
 *  - Enforce RBAC permission checks (calls.read) before each read operation.
 *  - Build paginated list responses with PaginationMeta.
 *  - Delegate data access to CallRepository.
 *
 * Dependencies:
 *  - CallRepository — data access
 *  - AuthService    — permission enforcement
 */

import { AppError } from "../../../shared/errors/app-error";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/pagination/pagination";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { CallRepository } from "./call.repository";
import type { CallDetailResponse, CallResponse, ListCallsQuery } from "./call.schemas";

export interface CallListResult {
  data: CallResponse[];
  meta: PaginationMeta;
}

export class CallService {
  public constructor(
    private readonly repository: CallRepository,
    private readonly authService: AuthService
  ) {}

  /**
   * List calls with pagination and optional filters.
   * Requires: calls.read
   */
  public async listCalls(actor: AuthenticatedUser, query: ListCallsQuery): Promise<CallListResult> {
    this.authService.assertPermission(actor, "calls.read");

    const { page, pageSize, ...filters } = query;
    const { data, total } = await this.repository.findMany(filters, { page, pageSize });

    return {
      data,
      meta: buildPaginationMeta(total, { page, pageSize }),
    };
  }

  /**
   * Get a single call by its database UUID, including the full conversation transcript.
   * Requires: calls.read
   */
  public async getCallById(actor: AuthenticatedUser, callId: string): Promise<CallDetailResponse> {
    this.authService.assertPermission(actor, "calls.read");

    const call = await this.repository.findById(callId);

    if (!call) {
      throw new AppError(404, "CALL_NOT_FOUND", `Call with ID '${callId}' was not found.`);
    }

    return call;
  }
}
