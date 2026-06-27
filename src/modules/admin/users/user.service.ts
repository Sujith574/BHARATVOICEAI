/**
 * user.service.ts
 *
 * Business logic layer for the User Management API.
 *
 * Responsibilities:
 *  - Enforce RBAC permission checks before each operation.
 *  - Prevent self-status-modification (an admin cannot suspend their own account).
 *  - Write audit log entries for every mutation.
 *  - Delegate data access to UserRepository.
 *
 * Dependencies:
 *  - UserRepository   — data access
 *  - AuthService      — permission enforcement
 *  - AuditService     — audit logging
 */

import { AppError } from "../../../shared/errors/app-error";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/pagination/pagination";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { AuditService } from "../audit/audit.service";
import type { UserRepository } from "./user.repository";
import type {
  AssignRoleBody,
  ListUsersQuery,
  UpdateUserStatusBody,
  UserResponse,
  UserRoleResponse
} from "./user.schemas";

export interface UserListResult {
  data: UserResponse[];
  meta: PaginationMeta;
}

export class UserService {
  public constructor(
    private readonly repository: UserRepository,
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  /**
   * List users with pagination and optional filters.
   * Requires: platform.users.read
   */
  public async listUsers(actor: AuthenticatedUser, query: ListUsersQuery): Promise<UserListResult> {
    this.authService.assertPermission(actor, "platform.users.read");

    const { page, pageSize, ...filters } = query;
    const { data, total } = await this.repository.findMany(filters, { page, pageSize });

    return {
      data,
      meta: buildPaginationMeta(total, { page, pageSize })
    };
  }

  /**
   * Get a single user by their platform UUID.
   * Requires: platform.users.read
   */
  public async getUserById(actor: AuthenticatedUser, userId: string): Promise<UserResponse> {
    this.authService.assertPermission(actor, "platform.users.read");

    const user = await this.repository.findById(userId);

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", `User with ID '${userId}' was not found.`);
    }

    return user;
  }

  /**
   * Update a user's status (ACTIVE / SUSPENDED / DEACTIVATED).
   * Requires: platform.users.manage
   * Guard: An actor cannot modify their own status.
   */
  public async updateUserStatus(
    actor: AuthenticatedUser,
    userId: string,
    body: UpdateUserStatusBody,
    context: { ipAddress?: string; userAgent?: string; requestId?: string } = {}
  ): Promise<UserResponse> {
    this.authService.assertPermission(actor, "platform.users.manage");

    if (actor.id === userId) {
      throw new AppError(
        422,
        "SELF_STATUS_MODIFICATION_FORBIDDEN",
        "An administrator cannot change their own account status."
      );
    }

    const updated = await this.repository.updateStatus(userId, body.status);

    await this.auditService.log({
      actorUserId: actor.id,
      subjectUserId: userId,
      entityType: "USER",
      entityId: userId,
      action: `USER_STATUS_UPDATED_TO_${body.status}`,
      metadata: { previousStatus: "UNKNOWN", reason: body.reason ?? null },
      ...context
    });

    return updated;
  }

  /**
   * Assign a role to a user.
   * Requires: platform.users.manage
   */
  public async assignRole(
    actor: AuthenticatedUser,
    userId: string,
    body: AssignRoleBody,
    context: { ipAddress?: string; userAgent?: string; requestId?: string } = {}
  ): Promise<UserRoleResponse> {
    this.authService.assertPermission(actor, "platform.users.manage");

    // Verify the target user exists
    const targetUser = await this.repository.findById(userId);
    if (!targetUser) {
      throw new AppError(404, "USER_NOT_FOUND", `User with ID '${userId}' was not found.`);
    }

    const assignment = await this.repository.assignRole(userId, body);

    await this.auditService.log({
      actorUserId: actor.id,
      subjectUserId: userId,
      entityType: "USER_ROLE",
      entityId: assignment.userRoleId,
      action: "USER_ROLE_ASSIGNED",
      metadata: {
        roleId: body.roleId,
        roleCode: assignment.roleCode,
        scope: body.scope,
        stateCode: body.stateCode ?? null
      },
      ...context
    });

    return assignment;
  }

  /**
   * Remove a role assignment from a user.
   * Requires: platform.users.manage
   * Guard: An actor cannot remove their own last role.
   */
  public async removeRole(
    actor: AuthenticatedUser,
    userId: string,
    userRoleId: string,
    context: { ipAddress?: string; userAgent?: string; requestId?: string } = {}
  ): Promise<void> {
    this.authService.assertPermission(actor, "platform.users.manage");

    const targetUser = await this.repository.findById(userId);
    if (!targetUser) {
      throw new AppError(404, "USER_NOT_FOUND", `User with ID '${userId}' was not found.`);
    }

    // Prevent stripping the last role from the actor's own account
    if (actor.id === userId && targetUser.roles.length <= 1) {
      throw new AppError(
        422,
        "LAST_ROLE_REMOVAL_FORBIDDEN",
        "You cannot remove your own last role assignment."
      );
    }

    await this.repository.removeRole(userId, userRoleId);

    await this.auditService.log({
      actorUserId: actor.id,
      subjectUserId: userId,
      entityType: "USER_ROLE",
      entityId: userRoleId,
      action: "USER_ROLE_REMOVED",
      metadata: { userRoleId },
      ...context
    });
  }
}
