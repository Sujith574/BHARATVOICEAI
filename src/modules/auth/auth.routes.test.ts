import { AssignmentScope, UserStatus } from "@prisma/client";
import request from "supertest";

import { createTestApp } from "../../test/helpers/create-test-app";
import type { AuthenticatedIdentity, AuthenticatedUser } from "./auth.types";

const viewerIdentity: AuthenticatedIdentity = {
  authUserId: "00000000-0000-0000-0000-000000000001",
  email: "viewer@example.gov.in",
  fullName: "Viewer User",
  supabaseRole: "authenticated",
  appMetadata: {},
  userMetadata: {}
};

const limitedUser: AuthenticatedUser = {
  id: "user-limited",
  authUserId: "00000000-0000-0000-0000-000000000002",
  email: "limited@example.gov.in",
  fullName: "Limited User",
  status: UserStatus.ACTIVE,
  roles: [
    {
      code: "LIMITED_USER",
      name: "LIMITED_USER",
      scope: AssignmentScope.GLOBAL
    }
  ],
  permissions: []
};

describe("auth and admin routes", () => {
  it("bootstraps the authenticated user", async () => {
    const { app } = createTestApp({}, { tokenIdentities: { "valid-token": viewerIdentity } });

    const response = await request(app)
      .post("/api/v1/auth/bootstrap")
      .set("authorization", "Bearer valid-token");
    const body = response.body as { data: { user: AuthenticatedUser } };

    expect(response.status).toBe(200);
    expect(body.data.user.email).toBe("viewer@example.gov.in");
    expect(body.data.user.roles[0]?.code).toBe("ADMIN_VIEWER");
  });

  it("rejects access to /auth/me when the user has not been provisioned", async () => {
    const { app } = createTestApp({}, { tokenIdentities: { "valid-token": viewerIdentity } });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("authorization", "Bearer valid-token");
    const body = response.body as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ADMIN_ACCESS_NOT_PROVISIONED");
  });

  it("returns admin session data for a provisioned user with dashboard access", async () => {
    const seededViewer: AuthenticatedUser = {
      id: "user-viewer",
      authUserId: viewerIdentity.authUserId,
      email: viewerIdentity.email,
      fullName: viewerIdentity.fullName,
      status: UserStatus.ACTIVE,
      roles: [
        {
          code: "ADMIN_VIEWER",
          name: "ADMIN_VIEWER",
          scope: AssignmentScope.GLOBAL
        }
      ],
      permissions: ["mobile.dashboard.read"]
    };
    const { app } = createTestApp(
      {},
      {
        seedUsers: [seededViewer],
        tokenIdentities: { "viewer-token": viewerIdentity }
      }
    );

    const response = await request(app)
      .get("/api/v1/admin/session")
      .set("authorization", "Bearer viewer-token");
    const body = response.body as { data: { user: AuthenticatedUser } };

    expect(response.status).toBe(200);
    expect(body.data.user.email).toBe("viewer@example.gov.in");
  });

  it("rejects admin session access without the required permission", async () => {
    const limitedIdentity: AuthenticatedIdentity = {
      authUserId: limitedUser.authUserId,
      email: limitedUser.email,
      fullName: limitedUser.fullName,
      supabaseRole: "authenticated",
      appMetadata: {},
      userMetadata: {}
    };
    const { app } = createTestApp(
      {},
      {
        seedUsers: [limitedUser],
        tokenIdentities: { "limited-token": limitedIdentity }
      }
    );

    const response = await request(app)
      .get("/api/v1/admin/session")
      .set("authorization", "Bearer limited-token");
    const body = response.body as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("INSUFFICIENT_PERMISSION");
  });
});
