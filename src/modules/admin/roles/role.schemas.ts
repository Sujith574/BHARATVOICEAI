/**
 * role.schemas.ts
 *
 * Zod schemas and TypeScript response types for the Roles API.
 */

import { z } from "zod";

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const listRolesQuerySchema = z.object({
  /** Optionally filter by record status */
  status: z.enum(["ACTIVE", "INACTIVE", "DEPRECATED"]).optional()
});

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;

// ─── Response Shapes ───────────────────────────────────────────────────────────

export interface PermissionResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface RoleResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  status: string;
  permissions: PermissionResponse[];
  createdAt: string;
  updatedAt: string;
}
