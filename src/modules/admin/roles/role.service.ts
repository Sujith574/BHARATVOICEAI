/**
 * role.service.ts
 *
 * Business logic layer for the Roles API.
 *
 * Responsibilities:
 *  - Enforce the `platform.roles.read` permission before returning data.
 *  - Map repository results into API responses.
 *
 * Dependencies:
 *  - RoleRepository — data access
 *  - AuthService    — permission enforcement
 */

import { AppError } from "../../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { RoleRepository } from "./role.repository";
import type { ListRolesQuery, RoleResponse } from "./role.schemas";

export class RoleService {
  public constructor(
    private readonly repository: RoleRepository,
    private readonly authService: AuthService
  ) {}

  /**
   * List all roles (with permissions).
   * Requires: platform.roles.read
   */
  public async listRoles(actor: AuthenticatedUser, query: ListRolesQuery): Promise<RoleResponse[]> {
    this.authService.assertPermission(actor, "platform.roles.read");
    return this.repository.findAll(query);
  }

  /**
   * Get a single role by ID (with permissions).
   * Requires: platform.roles.read
   */
  public async getRoleById(actor: AuthenticatedUser, id: string): Promise<RoleResponse> {
    this.authService.assertPermission(actor, "platform.roles.read");

    const role = await this.repository.findById(id);

    if (!role) {
      throw new AppError(404, "ROLE_NOT_FOUND", `Role with ID '${id}' was not found.`);
    }

    return role;
  }
}
