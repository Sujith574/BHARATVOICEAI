import type { Logger } from "pino";

import { AppError } from "../../shared/errors/app-error";
import type { AuthRepository } from "./auth.repository";
import type { AccessTokenVerifier, AuthenticatedIdentity, AuthenticatedUser, BootstrapAuditContext } from "./auth.types";

export interface AuthServiceConfig {
  defaultRoleCode: string;
  superAdminEmails: string[];
}

export class AuthService {
  public constructor(
    private readonly tokenVerifier: AccessTokenVerifier,
    private readonly repository: AuthRepository,
    private readonly logger: Logger,
    private readonly config: AuthServiceConfig
  ) {}

  public async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    return this.tokenVerifier.verifyAccessToken(token);
  }

  public async bootstrapAuthenticatedUser(
    identity: AuthenticatedIdentity,
    context: BootstrapAuditContext = {}
  ): Promise<AuthenticatedUser> {
    const user = await this.repository.bootstrapAuthenticatedUser(identity, {
      defaultRoleCode: this.config.defaultRoleCode,
      superAdminEmails: this.config.superAdminEmails,
      ...context
    });

    this.logger.info(
      {
        userId: user.id,
        authUserId: user.authUserId,
        roleCount: user.roles.length
      },
      "Bootstrapped authenticated admin user"
    );

    return user;
  }

  public async getProvisionedUser(identity: AuthenticatedIdentity): Promise<AuthenticatedUser> {
    const user = await this.repository.findUserAccessByAuthUserId(identity.authUserId);

    if (!user) {
      throw new AppError(
        403,
        "ADMIN_ACCESS_NOT_PROVISIONED",
        "The authenticated user has not been provisioned in Bharat Voice yet."
      );
    }

    return user;
  }

  public assertPermission(user: AuthenticatedUser, permissionCode: string): void {
    if (!user.permissions.includes(permissionCode)) {
      throw new AppError(
        403,
        "INSUFFICIENT_PERMISSION",
        `The authenticated user does not have the '${permissionCode}' permission.`
      );
    }
  }
}
