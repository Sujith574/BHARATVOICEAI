import { AssignmentScope, RecordStatus, type Prisma } from "@prisma/client";

import { AppError } from "../../shared/errors/app-error";
import type { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedIdentity, AuthenticatedUser, AuthenticatedUserRole, BootstrapUserOptions } from "./auth.types";

export interface AuthRepository {
  findUserAccessByAuthUserId(authUserId: string): Promise<AuthenticatedUser | null>;
  bootstrapAuthenticatedUser(identity: AuthenticatedIdentity, options: BootstrapUserOptions): Promise<AuthenticatedUser>;
}

const userAccessInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.UserInclude;

type UserAccessRecord = Prisma.UserGetPayload<{
  include: typeof userAccessInclude;
}>;

const mapRole = (assignment: UserAccessRecord["userRoles"][number]): AuthenticatedUserRole => ({
  code: assignment.role.code,
  name: assignment.role.name,
  scope: assignment.scope,
  stateCode: assignment.stateCode ?? undefined,
  departmentId: assignment.departmentId ?? undefined,
  serviceId: assignment.serviceId ?? undefined
});

const mapUser = (user: UserAccessRecord): AuthenticatedUser => {
  const permissions = new Set<string>();

  for (const assignment of user.userRoles) {
    for (const rolePermission of assignment.role.rolePermissions) {
      permissions.add(rolePermission.permission.code);
    }
  }

  return {
    id: user.id,
    authUserId: user.supabaseAuthUserId,
    email: user.email,
    phoneNumber: user.phoneNumber ?? undefined,
    fullName: user.fullName ?? undefined,
    preferredLanguage: user.preferredLanguage ?? undefined,
    stateCode: user.stateCode ?? undefined,
    status: user.status,
    roles: user.userRoles.map(mapRole),
    permissions: [...permissions].sort(),
    lastLoginAt: user.lastLoginAt?.toISOString()
  };
};

export class PrismaAuthRepository implements AuthRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findUserAccessByAuthUserId(authUserId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: {
        supabaseAuthUserId: authUserId
      },
      include: userAccessInclude
    });

    return user ? mapUser(user) : null;
  }

  public async bootstrapAuthenticatedUser(
    identity: AuthenticatedIdentity,
    options: BootstrapUserOptions
  ): Promise<AuthenticatedUser> {
    return this.prisma.$transaction(async (transaction) => {
      const email = identity.email.trim().toLowerCase();
      const user = await transaction.user.upsert({
        where: {
          supabaseAuthUserId: identity.authUserId
        },
        create: {
          supabaseAuthUserId: identity.authUserId,
          email,
          phoneNumber: identity.phoneNumber ?? null,
          fullName: identity.fullName ?? null,
          status: "ACTIVE",
          lastLoginAt: new Date()
        },
        update: {
          email,
          phoneNumber: identity.phoneNumber ?? null,
          fullName: identity.fullName ?? null,
          lastLoginAt: new Date()
        }
      });

      const roleAssignmentsCount = await transaction.userRole.count({
        where: {
          userId: user.id
        }
      });

      let initialRoleCode: string | undefined;

      if (roleAssignmentsCount === 0) {
        initialRoleCode = options.superAdminEmails.includes(email) ? "SUPER_ADMIN" : options.defaultRoleCode;
        const initialRole = await transaction.role.findFirst({
          where: {
            code: initialRoleCode,
            status: RecordStatus.ACTIVE
          }
        });

        if (!initialRole) {
          throw new AppError(
            500,
            "INITIAL_ROLE_NOT_FOUND",
            `Default admin role '${initialRoleCode}' does not exist or is inactive.`
          );
        }

        await transaction.userRole.create({
          data: {
            userId: user.id,
            roleId: initialRole.id,
            scope: AssignmentScope.GLOBAL
          }
        });
      }

      const hydratedUser = await transaction.user.findUnique({
        where: {
          id: user.id
        },
        include: userAccessInclude
      });

      if (!hydratedUser) {
        throw new AppError(500, "USER_BOOTSTRAP_FAILED", "The authenticated user could not be loaded after bootstrap.");
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: hydratedUser.id,
          subjectUserId: hydratedUser.id,
          entityType: "USER",
          entityId: hydratedUser.id,
          action: roleAssignmentsCount === 0 ? "AUTH_USER_PROVISIONED" : "AUTH_SESSION_BOOTSTRAPPED",
          metadata: {
            email,
            initialRoleCode: initialRoleCode ?? null,
            supabaseRole: identity.supabaseRole ?? null
          },
          ipAddress: options.ipAddress ?? null,
          userAgent: options.userAgent ?? null,
          requestId: options.requestId ?? null
        }
      });

      return mapUser(hydratedUser);
    });
  }
}
