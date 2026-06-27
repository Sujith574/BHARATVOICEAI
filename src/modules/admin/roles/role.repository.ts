/**
 * role.repository.ts
 *
 * Data-access layer for Role and Permission records.
 *
 * Responsibilities:
 *  - List all roles with their nested permissions (for mobile role picker).
 *  - Fetch a single role by ID with full permission detail.
 *
 * Roles are primarily read-only from the API surface — creation and
 * mutation is handled by the database seed and future admin tooling.
 */

import type { Prisma } from "@prisma/client";

import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { ListRolesQuery, PermissionResponse, RoleResponse } from "./role.schemas";

const roleInclude = {
  rolePermissions: {
    include: {
      permission: true
    },
    where: {
      permission: {
        status: "ACTIVE" as const
      }
    }
  }
} satisfies Prisma.RoleInclude;

type RoleRecord = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

const mapRole = (role: RoleRecord): RoleResponse => {
  const permissions: PermissionResponse[] = role.rolePermissions.map((rp) => ({
    id: rp.permission.id,
    code: rp.permission.code,
    name: rp.permission.name,
    description: rp.permission.description ?? null
  }));

  // Sort permissions alphabetically for consistent display
  permissions.sort((a, b) => a.code.localeCompare(b.code));

  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description ?? null,
    isSystemRole: role.isSystemRole,
    status: role.status,
    permissions,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString()
  };
};

// ─── Repository Interface ──────────────────────────────────────────────────────

export interface RoleRepository {
  findAll(query: ListRolesQuery): Promise<RoleResponse[]>;
  findById(id: string): Promise<RoleResponse | null>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaRoleRepository implements RoleRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findAll(query: ListRolesQuery): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      where: {
        status: query.status ?? "ACTIVE"
      },
      include: roleInclude,
      orderBy: { name: "asc" }
    });

    return roles.map(mapRole);
  }

  public async findById(id: string): Promise<RoleResponse | null> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: roleInclude
    });

    return role ? mapRole(role) : null;
  }
}
