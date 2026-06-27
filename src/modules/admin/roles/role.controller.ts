/**
 * role.controller.ts
 *
 * HTTP controller for the Roles API.
 *
 * Endpoints:
 *   GET /admin/roles        — list all roles
 *   GET /admin/roles/:id    — get a single role by ID
 */

import type { Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error";
import type { RoleService } from "./role.service";
import type { ListRolesQuery } from "./role.schemas";

export class RoleController {
  public constructor(private readonly roleService: RoleService) {}

  /**
   * GET /admin/roles
   */
  public list = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const query = (request as Request & { parsedQuery: ListRolesQuery }).parsedQuery;
    const roles = await this.roleService.listRoles(request.authUser, query);

    response.status(200).json({ data: roles });
  };

  /**
   * GET /admin/roles/:id
   */
  public getById = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
    }

    const role = await this.roleService.getRoleById(request.authUser, String(request.params["id"]));
    response.status(200).json({ data: role });
  };
}
