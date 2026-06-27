import type { AssignmentScope, UserStatus } from "@prisma/client";

export interface AuthenticatedIdentity {
  authUserId: string;
  email: string;
  phoneNumber?: string | undefined;
  fullName?: string | undefined;
  supabaseRole?: string | undefined;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

export interface AuthenticatedUserRole {
  code: string;
  name: string;
  scope: AssignmentScope;
  stateCode?: string | undefined;
  departmentId?: string | undefined;
  serviceId?: string | undefined;
}

export interface AuthenticatedUser {
  id: string;
  authUserId: string;
  email: string;
  phoneNumber?: string | undefined;
  fullName?: string | undefined;
  preferredLanguage?: string | undefined;
  stateCode?: string | undefined;
  status: UserStatus;
  roles: AuthenticatedUserRole[];
  permissions: string[];
  lastLoginAt?: string | undefined;
}

export interface BootstrapAuditContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface BootstrapUserOptions extends BootstrapAuditContext {
  defaultRoleCode: string;
  superAdminEmails: string[];
}

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedIdentity>;
}
