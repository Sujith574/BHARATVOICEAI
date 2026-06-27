import { AssignmentScope, UserStatus } from "@prisma/client";
import pino from "pino";

import { AppError } from "../../shared/errors/app-error";
import type { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import type { AccessTokenVerifier, AuthenticatedIdentity, AuthenticatedUser, BootstrapUserOptions } from "./auth.types";

class FakeRepository implements AuthRepository {
  public user: AuthenticatedUser | null = null;

  public findUserAccessByAuthUserId(authUserId: string): Promise<AuthenticatedUser | null> {
    if (this.user?.authUserId === authUserId) {
      return Promise.resolve(this.user);
    }

    return Promise.resolve(null);
  }

  public bootstrapAuthenticatedUser(
    identity: AuthenticatedIdentity,
    options: BootstrapUserOptions
  ): Promise<AuthenticatedUser> {
    this.user = {
      id: "user-1",
      authUserId: identity.authUserId,
      email: identity.email,
      fullName: identity.fullName,
      status: UserStatus.ACTIVE,
      roles: [
        {
          code: options.defaultRoleCode,
          name: options.defaultRoleCode,
          scope: AssignmentScope.GLOBAL
        }
      ],
      permissions: ["mobile.dashboard.read"]
    };

    return Promise.resolve(this.user);
  }
}

class FakeTokenVerifier implements AccessTokenVerifier {
  public verifyAccessToken(): Promise<AuthenticatedIdentity> {
    return Promise.resolve({
      authUserId: "00000000-0000-0000-0000-000000000001",
      email: "viewer@example.gov.in",
      fullName: "Viewer User",
      supabaseRole: "authenticated",
      appMetadata: {},
      userMetadata: {}
    });
  }
}

describe("AuthService", () => {
  it("bootstraps a user with the configured default role", async () => {
    const repository = new FakeRepository();
    const service = new AuthService(new FakeTokenVerifier(), repository, pino({ enabled: false }), {
      defaultRoleCode: "ADMIN_VIEWER",
      superAdminEmails: []
    });

    const user = await service.bootstrapAuthenticatedUser({
      authUserId: "00000000-0000-0000-0000-000000000001",
      email: "viewer@example.gov.in",
      fullName: "Viewer User",
      appMetadata: {},
      userMetadata: {}
    });

    expect(user.roles[0]?.code).toBe("ADMIN_VIEWER");
    expect(user.permissions).toContain("mobile.dashboard.read");
  });

  it("throws when a provisioned user is missing", async () => {
    const repository = new FakeRepository();
    const service = new AuthService(new FakeTokenVerifier(), repository, pino({ enabled: false }), {
      defaultRoleCode: "ADMIN_VIEWER",
      superAdminEmails: []
    });

    await expect(
      service.getProvisionedUser({
        authUserId: "00000000-0000-0000-0000-000000000099",
        email: "missing@example.gov.in",
        appMetadata: {},
        userMetadata: {}
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
