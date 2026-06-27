/**
 * user.schemas.ts
 *
 * Zod schemas and TypeScript response types for the User Management API.
 *
 * Covers:
 *  - Listing users (with pagination + filters)
 *  - Updating user status
 *  - Assigning a role to a user
 *  - API response shape
 */

import { z } from "zod";

import { paginationQuerySchema } from "../../../shared/pagination/pagination";

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const listUsersQuerySchema = paginationQuerySchema.extend({
  /** Filter by user status */
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  /** Filter by state code */
  stateCode: z.string().max(8).optional(),
  /** Full-text search on email or name (case-insensitive, partial match) */
  search: z.string().max(200).optional()
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────

export const updateUserStatusBodySchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z.string().max(500).optional()
});

export type UpdateUserStatusBody = z.infer<typeof updateUserStatusBodySchema>;

export const assignRoleBodySchema = z.object({
  roleId: z.string().uuid(),
  scope: z.enum(["GLOBAL", "STATE", "DEPARTMENT", "SERVICE"]).default("GLOBAL"),
  stateCode: z.string().max(8).optional(),
  departmentId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional()
});

export type AssignRoleBody = z.infer<typeof assignRoleBodySchema>;

// ─── Response Shapes ───────────────────────────────────────────────────────────

export interface UserRoleResponse {
  userRoleId: string;
  roleCode: string;
  roleName: string;
  scope: string;
  stateCode: string | null;
  departmentId: string | null;
  serviceId: string | null;
  assignedAt: string;
}

export interface UserResponse {
  id: string;
  email: string;
  phoneNumber: string | null;
  fullName: string | null;
  preferredLanguage: string | null;
  stateCode: string | null;
  status: string;
  roles: UserRoleResponse[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
