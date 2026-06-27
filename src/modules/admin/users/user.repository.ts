/**
 * user.repository.ts
 *
 * Data-access layer for User and UserRole records.
 *
 * Responsibilities:
 *  - Paginated user listing with optional email/name search, status, and state filters.
 *  - Single-user fetch with full role hydration.
 *  - User status mutations (activate, suspend, deactivate).
 *  - Role assignment and removal.
 *
 * All mutations operate atomically where appropriate.
 */

import type { Prisma } from "@prisma/client";

import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { PaginationQuery } from "../../../shared/pagination/pagination";
import { buildPrismaSkipTake } from "../../../shared/pagination/pagination";
import type { AssignRoleBody, ListUsersQuery, UserResponse, UserRoleResponse } from "./user.schemas";

// ─── Internal Prisma include shape ────────────────────────────────────────────

const userInclude = {
  userRoles: {
    include: {
      role: true
    },
    orderBy: {
      assignedAt: "asc" as const
    }
  }
} satisfies Prisma.UserInclude;

type UserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

// ─── Mappers ──────────────────────────────────────────────────────────────────

const mapUserRole = (assignment: UserRecord["userRoles"][number]): UserRoleResponse => ({
  userRoleId: assignment.id,
  roleCode: assignment.role.code,
  roleName: assignment.role.name,
  scope: assignment.scope,
  stateCode: assignment.stateCode,
  departmentId: assignment.departmentId,
  serviceId: assignment.serviceId,
  assignedAt: assignment.assignedAt.toISOString()
});

const mapUser = (user: UserRecord): UserResponse => ({
  id: user.id,
  email: user.email,
  phoneNumber: user.phoneNumber,
  fullName: user.fullName,
  preferredLanguage: user.preferredLanguage,
  stateCode: user.stateCode,
  status: user.status,
  roles: user.userRoles.map(mapUserRole),
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString()
});

// ─── Repository Interface ──────────────────────────────────────────────────────

export interface UserRepository {
  findMany(
    filters: Omit<ListUsersQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: UserResponse[]; total: number }>;

  findById(id: string): Promise<UserResponse | null>;

  updateStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"): Promise<UserResponse>;

  assignRole(userId: string, body: AssignRoleBody): Promise<UserRoleResponse>;

  removeRole(userId: string, userRoleId: string): Promise<void>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaUserRepository implements UserRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findMany(
    filters: Omit<ListUsersQuery, keyof PaginationQuery>,
    pagination: PaginationQuery
  ): Promise<{ data: UserResponse[]; total: number }> {
    const where: Prisma.UserWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.stateCode) {
      where.stateCode = filters.stateCode;
    }

    if (filters.search) {
      // Case-insensitive partial match on email or full name
      where.OR = [
        { email: { contains: filters.search, mode: "insensitive" } },
        { fullName: { contains: filters.search, mode: "insensitive" } }
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { createdAt: "desc" },
        ...buildPrismaSkipTake(pagination)
      }),
      this.prisma.user.count({ where })
    ]);

    return { data: users.map(mapUser), total };
  }

  public async findById(id: string): Promise<UserResponse | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude
    });

    return user ? mapUser(user) : null;
  }

  public async updateStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
  ): Promise<UserResponse> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: userInclude
    });

    return mapUser(user);
  }

  public async assignRole(userId: string, body: AssignRoleBody): Promise<UserRoleResponse> {
    const assignment = await this.prisma.userRole.create({
      data: {
        userId,
        roleId: body.roleId,
        scope: body.scope,
        stateCode: body.stateCode ?? null,
        departmentId: body.departmentId ?? null,
        serviceId: body.serviceId ?? null
      },
      include: {
        role: true
      }
    });

    return {
      userRoleId: assignment.id,
      roleCode: assignment.role.code,
      roleName: assignment.role.name,
      scope: assignment.scope,
      stateCode: assignment.stateCode,
      departmentId: assignment.departmentId,
      serviceId: assignment.serviceId,
      assignedAt: assignment.assignedAt.toISOString()
    };
  }

  public async removeRole(userId: string, userRoleId: string): Promise<void> {
    // Verify ownership before deletion to prevent IDOR
    await this.prisma.userRole.deleteMany({
      where: {
        id: userRoleId,
        userId
      }
    });
  }
}
