/**
 * user.controller.ts
 *
 * HTTP controller for the User Management API.
 *
 * Endpoints:
 *   GET    /admin/users                         — paginated list
 *   GET    /admin/users/:id                     — single user by ID
 *   PATCH  /admin/users/:id/status              — update status
 *   POST   /admin/users/:id/roles               — assign role
 *   DELETE /admin/users/:id/roles/:userRoleId   — remove role assignment
 *
 * All endpoints require a valid authenticated admin user (set by requireAuth middleware).
 * Request context (IP, User-Agent, Request-ID) is forwarded to the service for audit logging.
 */

import type { Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error";
import type { UserService } from "./user.service";
import type { AssignRoleBody, ListUsersQuery, UpdateUserStatusBody } from "./user.schemas";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  /**
   * GET /admin/users
   */
  public list = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const query = (request as Request & { parsedQuery: ListUsersQuery }).parsedQuery;
    const result = await this.userService.listUsers(request.authUser, query);

    response.status(200).json(result);
  };

  /**
   * GET /admin/users/:id
   */
  public getById = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const user = await this.userService.getUserById(request.authUser, String(request.params["id"]));
    response.status(200).json({ data: user });
  };

  /**
   * PATCH /admin/users/:id/status
   */
  public updateStatus = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const body = request.body as UpdateUserStatusBody;
    const context = this.extractRequestContext(request);
    const updated = await this.userService.updateUserStatus(request.authUser, String(request.params["id"]), body, context);

    response.status(200).json({ data: updated });
  };

  /**
   * POST /admin/users/:id/roles
   */
  public assignRole = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const body = request.body as AssignRoleBody;
    const context = this.extractRequestContext(request);
    const assignment = await this.userService.assignRole(request.authUser, String(request.params["id"]), body, context);

    response.status(201).json({ data: assignment });
  };

  /**
   * DELETE /admin/users/:id/roles/:userRoleId
   */
  public removeRole = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const userId = String(request.params["id"]);
    const userRoleId = String(request.params["userRoleId"]);
    const context = this.extractRequestContext(request);
    await this.userService.removeRole(request.authUser, userId, userRoleId, context);

    response.status(204).send();
  };

  /** Extract audit-relevant fields from the incoming request */
  private extractRequestContext(request: Request): {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  } {
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];
    const requestId = request.headers["x-request-id"];
    return {
      ...(ipAddress !== undefined && { ipAddress }),
      ...(typeof userAgent === "string" && { userAgent }),
      ...(typeof requestId === "string" && { requestId })
    };
  }
}
