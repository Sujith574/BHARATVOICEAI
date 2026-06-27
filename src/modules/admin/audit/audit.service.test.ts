/**
 * audit.service.test.ts
 *
 * Unit tests for AuditService.
 *
 * Tests:
 *  - log() never throws even when repository fails
 *  - listAuditLogs() enforces the audit.read permission
 *  - listAuditLogs() returns paginated results
 */

import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { AssignmentScope, UserStatus } from "@prisma/client";

import { AuditService } from "./audit.service";
import { AuthService } from "../../auth/auth.service";
import { AppError } from "../../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { InMemoryAuditRepository } from "../../../test/helpers/create-test-app";
import type { AuditRepository } from "./audit.repository";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const superAdminUser: AuthenticatedUser = {
  id: "user-super",
  authUserId: "00000000-0000-0000-0000-000000000001",
  email: "super@example.gov.in",
  status: UserStatus.ACTIVE,
  roles: [{ code: "SUPER_ADMIN", name: "Super Admin", scope: AssignmentScope.GLOBAL }],
  permissions: ["audit.read", "platform.users.read"],
  lastLoginAt: new Date().toISOString()
};

const viewerUser: AuthenticatedUser = {
  id: "user-viewer",
  authUserId: "00000000-0000-0000-0000-000000000002",
  email: "viewer@example.gov.in",
  status: UserStatus.ACTIVE,
  roles: [{ code: "ADMIN_VIEWER", name: "Admin Viewer", scope: AssignmentScope.GLOBAL }],
  permissions: ["mobile.dashboard.read"],
  lastLoginAt: new Date().toISOString()
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildAuthService = (): AuthService => {
  const logger = pino({ enabled: false });
  return new AuthService(
    {
      verifyAccessToken: () => Promise.reject(new AppError(401, "TEST", "unused"))
    },
    {
      findUserAccessByAuthUserId: () => Promise.resolve(null),
      bootstrapAuthenticatedUser: () => Promise.reject(new AppError(500, "TEST", "unused"))
    },
    logger,
    { defaultRoleCode: "ADMIN_VIEWER", superAdminEmails: [] }
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AuditService.log()", () => {
  it("writes an audit entry to the repository", async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo, buildAuthService(), pino({ enabled: false }));

    await service.log({ entityType: "USER", action: "USER_CREATED", actorUserId: "actor-1" });

    expect(repo.written).toHaveLength(1);
    expect(repo.written[0]).toMatchObject({ entityType: "USER", action: "USER_CREATED", actorUserId: "actor-1" });
  });

  it("does not throw when the repository fails", async () => {
    const failingRepo: AuditRepository = {
      write: () => Promise.reject(new Error("DB connection lost")),
      findMany: () => Promise.resolve({ data: [], total: 0 })
    };

    const service = new AuditService(failingRepo, buildAuthService(), pino({ enabled: false }));

    // Must resolve without throwing even though the repository threw
    await expect(
      service.log({ entityType: "USER", action: "USER_CREATED" })
    ).resolves.toBeUndefined();
  });
});

describe("AuditService.listAuditLogs()", () => {
  it("throws 403 when actor lacks audit.read permission", async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo, buildAuthService(), pino({ enabled: false }));

    await expect(
      service.listAuditLogs(viewerUser, { page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403, code: "INSUFFICIENT_PERMISSION" });
  });

  it("returns paginated results for a user with audit.read", async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo, buildAuthService(), pino({ enabled: false }));

    const result = await service.listAuditLogs(superAdminUser, { page: 1, pageSize: 10 });

    expect(result.data).toEqual([]);
    expect(result.meta).toMatchObject({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it("passes filters to the repository", async () => {
    const repo = new InMemoryAuditRepository();
    const findManySpy = vi.spyOn(repo, "findMany");
    const service = new AuditService(repo, buildAuthService(), pino({ enabled: false }));

    await service.listAuditLogs(superAdminUser, {
      page: 2,
      pageSize: 5,
      entityType: "USER",
      action: "USER_CREATED"
    });

    expect(findManySpy).toHaveBeenCalledWith(
      { entityType: "USER", action: "USER_CREATED" },
      { page: 2, pageSize: 5 }
    );
  });
});
