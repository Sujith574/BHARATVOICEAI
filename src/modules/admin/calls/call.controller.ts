/**
 * call.controller.ts
 *
 * HTTP controller for the Call Records API.
 *
 * Endpoints:
 *   GET /admin/calls        — paginated call history
 *   GET /admin/calls/:id    — single call detail with full transcript
 *
 * All endpoints require authentication (enforced via requireAuth middleware in routes).
 */

import type { Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error";
import type { CallService } from "./call.service";
import type { ListCallsQuery } from "./call.schemas";

export class CallController {
  public constructor(private readonly callService: CallService) {}

  /**
   * GET /admin/calls
   */
  public list = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const query = (request as Request & { parsedQuery: ListCallsQuery }).parsedQuery;
    const result = await this.callService.listCalls(request.authUser, query);

    response.status(200).json(result);
  };

  /**
   * GET /admin/calls/:id
   */
  public getById = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const call = await this.callService.getCallById(
      request.authUser,
      String(request.params["id"])
    );

    response.status(200).json({ data: call });
  };
}
