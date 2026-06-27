/**
 * user.service.test.ts
 *
 * Unit tests for UserService.
 *
 * Tests:
 *  - listUsers() enforces platform.users.read permission
 *  - getUserById() returns 404 for unknown user
 *  - updateUserStatus() enforces platform.users.manage permission
 *  - updateUserStatus() prevents self-modification
 *  - assignRole() writes an audit log
 *  - removeRole() prevents removing actor's last role
 */

import { describe, it, expect } from "vitest";
import pino from "pino";
import { AssignmentScope, UserStatus } from "@prisma/client";

import { UserService } from "./user.service";
import { AuthService } from "../../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { InMemoryAuditRepository, InMemoryUserRepository } from "../../../test/helpers/create-test-app";
import type { UserResponse } from "./user.schemas";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const superAdminUser: AuthenticatedUser = {
  id: "user-super",
  authUserId: "auth-super",
  email: "super@example.gov.in",
  status: UserStatus.ACTIVE,
  roles: [{ code: "SUPER_ADMIN", name: "Super Admin", scope: AssignmentScope.GLOBAL }],
  permissions: [
    "platform.users.read",
    "platform.users.manage",
    "platform.roles.read",
    "audit.read",
    "mobile.dashboard.read"
  ],
  lastLoginAt: new Date().toISOString()
};

const viewerUser: AuthenticatedUser = {
  id: "user-viewer",
  authUserId: "auth-viewer",
  email: "viewer@example.gov.in",
  status: UserStatus.ACTIVE,
  roles: [{ code: "ADMIN_VIEWER", name: "Admin Viewer", scope: AssignmentScope.GLOBAL }],
  permissions: ["mobile.dashboard.read"],
  lastLoginAt: new Date().toISOString()
};

const targetUserRecord: UserResponse = {
  id: "user-target",
  email: "target@example.gov.in",
  phoneNumber: null,
  fullName: "Target User",
  preferredLanguage: "en-IN",
  stateCode: "AP",
  status: "ACTIVE",
  roles: [
    {
      userRoleId: "role-assign-1",
      roleCode: "ADMIN_VIEWER",
      roleName: "Admin Viewer",
      scope: "GLOBAL",
      stateCode: null,
      departmentId: null,
      serviceId: null,
      assignedAt: new Date().toISOString()
    }
  ],
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildServices = (users: UserResponse[] = []) => {
  const logger = pino({ enabled: false });
  const authService = new AuthService(
    { verifyAccessToken: () => Promise.reject(new AppError(401, "TEST", "unused")) },
    {
      findUserAccessByAuthUserId: () => Promise.resolve(null),
      bootstrapAuthenticatedUser: () => Promise.reject(new AppError(500, "TEST", "unused"))
    },
    logger,
    { defaultRoleCode: "ADMIN_VIEWER", superAdminEmails: [] }
  );
  const auditRepo = new InMemoryAuditRepository();
  const auditService = new AuditService(auditRepo, authService, logger);
  const userRepo = new InMemoryUserRepository(users);
  const userService = new UserService(userRepo, authService, auditService);

  return { userService, userRepo, auditRepo };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("UserService.listUsers()", () => {
  it("throws 403 when actor lacks platform.users.read", async () => {
    const { userService } = buildServices();

    await expect(
      userService.listUsers(viewerUser, { page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403, code: "INSUFFICIENT_PERMISSION" });
  });

  it("returns paginated results for authorised actor", async () => {
    const { userService } = buildServices([targetUserRecord]);

    const result = await userService.listUsers(superAdminUser, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});

describe("UserService.getUserById()", () => {
  it("throws 404 for unknown user ID", async () => {
    const { userService } = buildServices();

    await expect(
      userService.getUserById(superAdminUser, "non-existent-id")
    ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
  });

  it("returns the user when found", async () => {
    const { userService } = buildServices([targetUserRecord]);

    const result = await userService.getUserById(superAdminUser, "user-target");

    expect(result.id).toBe("user-target");
  });
});

describe("UserService.updateUserStatus()", () => {
  it("throws 403 when actor lacks platform.users.manage", async () => {
    const { userService } = buildServices([targetUserRecord]);

    await expect(
      userService.updateUserStatus(viewerUser, "user-target", { status: "SUSPENDED" })
    ).rejects.toMatchObject({ statusCode: 403, code: "INSUFFICIENT_PERMISSION" });
  });

  it("throws 422 when actor tries to change their own status", async () => {
    const { userService } = buildServices([targetUserRecord]);

    await expect(
      userService.updateUserStatus(superAdminUser, superAdminUser.id, { status: "SUSPENDED" })
    ).rejects.toMatchObject({ statusCode: 422, code: "SELF_STATUS_MODIFICATION_FORBIDDEN" });
  });

  it("updates status and writes an audit log", async () => {
    const { userService, auditRepo } = buildServices([{ ...targetUserRecord }]);

    const result = await userService.updateUserStatus(superAdminUser, "user-target", { status: "SUSPENDED" });

    expect(result.status).toBe("SUSPENDED");
    expect(auditRepo.written).toHaveLength(1);
    expect(auditRepo.written[0]?.action).toBe("USER_STATUS_UPDATED_TO_SUSPENDED");
  });
});

describe("UserService.assignRole()", () => {
  it("throws 403 when actor lacks platform.users.manage", async () => {
    const { userService } = buildServices([targetUserRecord]);

    await expect(
      userService.assignRole(viewerUser, "user-target", { roleId: "role-uuid", scope: "GLOBAL" })
    ).rejects.toMatchObject({ statusCode: 403, code: "INSUFFICIENT_PERMISSION" });
  });

  it("writes an audit log on successful assignment", async () => {
    const { userService, auditRepo } = buildServices([targetUserRecord]);

    await userService.assignRole(superAdminUser, "user-target", { roleId: "role-uuid", scope: "GLOBAL" });

    expect(auditRepo.written).toHaveLength(1);
    expect(auditRepo.written[0]?.action).toBe("USER_ROLE_ASSIGNED");
    expect(auditRepo.written[0]?.subjectUserId).toBe("user-target");
  });
});

describe("UserService.removeRole()", () => {
  it("throws 422 when actor tries to remove their own last role", async () => {
    const selfRecord: UserResponse = {
      ...targetUserRecord,
      id: superAdminUser.id,
      email: superAdminUser.email
      // inherits single role from targetUserRecord
    };

    const { userService } = buildServices([selfRecord]);

    await expect(
      userService.removeRole(superAdminUser, superAdminUser.id, "role-assign-1")
    ).rejects.toMatchObject({ statusCode: 422, code: "LAST_ROLE_REMOVAL_FORBIDDEN" });
  });

  it("writes an audit log on successful removal", async () => {
    const secondRole = targetUserRecord.roles[0];
    if (!secondRole) throw new Error("Fixture missing role");

    const twoRolesRecord: UserResponse = {
      ...targetUserRecord,
      roles: [
        ...targetUserRecord.roles,
        { ...secondRole, userRoleId: "role-assign-2", roleCode: "OPS_ADMIN" }
      ]
    };
    const { userService, auditRepo } = buildServices([twoRolesRecord]);

    await userService.removeRole(superAdminUser, "user-target", "role-assign-1");

    expect(auditRepo.written).toHaveLength(1);
    expect(auditRepo.written[0]?.action).toBe("USER_ROLE_REMOVED");
  });
});
