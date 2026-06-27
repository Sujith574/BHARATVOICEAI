/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import pino from "pino";
import { AssignmentScope, UserStatus } from "@prisma/client";

import { createApp } from "../../app/create-app";
import type { AppConfig } from "../../config/env";
import type { AuthRepository } from "../../modules/auth/auth.repository";
import { AuthService } from "../../modules/auth/auth.service";
import type { AuditRepository, WriteAuditLogDto } from "../../modules/admin/audit/audit.repository";
import { AuditService } from "../../modules/admin/audit/audit.service";
import type { CallRepository } from "../../modules/admin/calls/call.repository";
import { CallService } from "../../modules/admin/calls/call.service";
import type { RoleRepository } from "../../modules/admin/roles/role.repository";
import { RoleService } from "../../modules/admin/roles/role.service";
import type { TicketRepository } from "../../modules/admin/tickets/ticket.repository";
import { TicketService } from "../../modules/admin/tickets/ticket.service";
import type { UserRepository } from "../../modules/admin/users/user.repository";
import { UserService } from "../../modules/admin/users/user.service";
import { InMemoryDeviceRepository } from "../../modules/admin/devices/device.repository";
import { DeviceService } from "../../modules/admin/devices/device.service";
import { PushNotificationService } from "../../modules/admin/devices/push-notification.service";
import { HydrationService } from "../../modules/admin/hydration/hydration.service";
import { AnalyticsService } from "../../modules/admin/analytics/analytics.service";
import { NotificationService } from "../../modules/admin/notifications/notification.service";
import { HealthService } from "../../modules/health/health.service";
import { VoiceService } from "../../modules/voice/voice.service";
import type {
  AccessTokenVerifier,
  AuthenticatedIdentity,
  AuthenticatedUser,
  BootstrapUserOptions
} from "../../modules/auth/auth.types";
import type { AssignRoleBody, ListUsersQuery, UserResponse, UserRoleResponse } from "../../modules/admin/users/user.schemas";
import type { RoleResponse, ListRolesQuery } from "../../modules/admin/roles/role.schemas";
import type { AuditLogResponse, ListAuditLogsQuery } from "../../modules/admin/audit/audit.schemas";
import type { PaginationQuery } from "../../shared/pagination/pagination";
import { AppError } from "../../shared/errors/app-error";
import { KnowledgeService } from "../../modules/knowledge/knowledge.service";
import type { KnowledgeRepository, CreateDocumentDto, SearchResult } from "../../modules/knowledge/knowledge.repository";
import { DocumentParserService } from "../../modules/knowledge/document-parser.service";
import { GeminiService } from "../../modules/ai/gemini.service";
import { GroundingEngine } from "../../modules/ai/grounding.engine";
import { CallSessionService } from "../../modules/voice/call-session.service";
import type { VoiceRepository } from "../../modules/voice/voice.repository";
import type { KnowledgeDocument } from "@prisma/client";

// ─── Base Config ──────────────────────────────────────────────────────────────

const baseConfig: AppConfig = {
  nodeEnv: "test",
  appName: "bharat-voice-backend-test",
  appVersion: "0.1.0-test",
  port: 3001,
  apiPrefix: "/api/v1",
  publicBaseUrl: "http://localhost:3001",
  corsOrigins: ["http://localhost:8081"],
  logLevel: "silent",
  trustProxyHops: 0,
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/bharat_voice_test",
  directUrl: "postgresql://postgres:postgres@127.0.0.1:5432/bharat_voice_test",
  prismaQueryLoggingEnabled: false,
  supabaseUrl: "https://bharat-voice.supabase.co",
  supabaseAnonKey: "anon-key",
  supabaseServiceRoleKey: "service-role-key",
  supabaseJwtAudience: "authenticated",
  supabaseJwksUrl: "https://bharat-voice.supabase.co/auth/v1/.well-known/jwks.json",
  supabaseJwtIssuer: "https://bharat-voice.supabase.co/auth/v1",
  defaultAdminRoleCode: "ADMIN_VIEWER",
  superAdminEmails: ["superadmin@example.gov.in"],
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 120,
  twilioAuthToken: undefined,
  twilioSignatureValidationEnabled: false,
  twilioMediaStreamEnabled: false,
  twilioMediaStreamPublicUrl: undefined,
  twilioMediaStreamSecret: undefined,
  twilioDefaultLanguage: "en-IN",
  geminiApiKey: "mock-gemini-key",
  sarvamApiKey: "mock-sarvam-key",
  wsHeartbeatIntervalMs: 15000
};

// ─── Default Fixtures ─────────────────────────────────────────────────────────

const defaultIdentity: AuthenticatedIdentity = {
  authUserId: "00000000-0000-0000-0000-000000000001",
  email: "viewer@example.gov.in",
  fullName: "Viewer User",
  supabaseRole: "authenticated",
  appMetadata: {},
  userMetadata: {}
};

export const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: [
    "mobile.dashboard.read",
    "platform.users.read",
    "platform.users.manage",
    "platform.roles.read",
    "platform.roles.manage",
    "voice.calls.read",
    "voice.calls.monitor",
    "knowledge.documents.read",
    "knowledge.documents.manage",
    "knowledge.documents.approve",
    "knowledge.departments.manage",
    "knowledge.services.manage",
    "analytics.read",
    "tickets.read",
    "tickets.manage",
    "audit.read",
    "platform.settings.manage",
    "notifications.read"
  ],
  ADMIN_VIEWER: ["mobile.dashboard.read", "voice.calls.read", "knowledge.documents.read", "analytics.read", "tickets.read", "notifications.read"],
  LIMITED_USER: []
};

// ─── In-Memory Auth Repository ────────────────────────────────────────────────

class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthenticatedUser>();

  public constructor(seedUsers: AuthenticatedUser[] = []) {
    for (const user of seedUsers) {
      this.users.set(user.authUserId, user);
    }
  }

  public findUserAccessByAuthUserId(authUserId: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.users.get(authUserId) ?? null);
  }

  public bootstrapAuthenticatedUser(
    identity: AuthenticatedIdentity,
    options: BootstrapUserOptions
  ): Promise<AuthenticatedUser> {
    const existing = this.users.get(identity.authUserId);

    if (existing) {
      return Promise.resolve(existing);
    }

    const normalizedEmail = identity.email.trim().toLowerCase();
    const roleCode = options.superAdminEmails.includes(normalizedEmail) ? "SUPER_ADMIN" : options.defaultRoleCode;
    const user: AuthenticatedUser = {
      id: `user-${identity.authUserId}`,
      authUserId: identity.authUserId,
      email: normalizedEmail,
      phoneNumber: identity.phoneNumber,
      fullName: identity.fullName,
      preferredLanguage: "en-IN",
      stateCode: "AP",
      status: UserStatus.ACTIVE,
      roles: [
        {
          code: roleCode,
          name: roleCode,
          scope: AssignmentScope.GLOBAL
        }
      ],
      permissions: rolePermissions[roleCode] ?? [],
      lastLoginAt: new Date().toISOString()
    };

    this.users.set(identity.authUserId, user);
    return Promise.resolve(user);
  }
}

// ─── In-Memory Audit Repository ───────────────────────────────────────────────

export class InMemoryAuditRepository implements AuditRepository {
  public readonly written: WriteAuditLogDto[] = [];

  public write(dto: WriteAuditLogDto): Promise<void> {
    this.written.push(dto);
    return Promise.resolve();
  }

  public findMany(
    _filters: Omit<ListAuditLogsQuery, keyof PaginationQuery>,
    _pagination: PaginationQuery
  ): Promise<{ data: AuditLogResponse[]; total: number }> {
    return Promise.resolve({ data: [], total: 0 });
  }
}

// ─── In-Memory Role Repository ────────────────────────────────────────────────

export class InMemoryRoleRepository implements RoleRepository {
  private readonly roles: RoleResponse[];

  public constructor(roles: RoleResponse[] = []) {
    this.roles = roles;
  }

  public findAll(_query: ListRolesQuery): Promise<RoleResponse[]> {
    return Promise.resolve(this.roles);
  }

  public findById(id: string): Promise<RoleResponse | null> {
    return Promise.resolve(this.roles.find((r) => r.id === id) ?? null);
  }
}

// ─── In-Memory User Repository ────────────────────────────────────────────────

export class InMemoryUserRepository implements UserRepository {
  public readonly users: UserResponse[];

  public constructor(users: UserResponse[] = []) {
    this.users = users;
  }

  public findMany(
    _filters: Omit<ListUsersQuery, keyof PaginationQuery>,
    _pagination: PaginationQuery
  ): Promise<{ data: UserResponse[]; total: number }> {
    return Promise.resolve({ data: this.users, total: this.users.length });
  }

  public findById(id: string): Promise<UserResponse | null> {
    return Promise.resolve(this.users.find((u) => u.id === id) ?? null);
  }

  public updateStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"): Promise<UserResponse> {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "Not found");
    user.status = status;
    return Promise.resolve(user);
  }

  public assignRole(_userId: string, body: AssignRoleBody): Promise<UserRoleResponse> {
    return Promise.resolve({
      userRoleId: "new-role-id",
      roleCode: "ADMIN_VIEWER",
      roleName: "Admin Viewer",
      scope: body.scope,
      stateCode: body.stateCode ?? null,
      departmentId: body.departmentId ?? null,
      serviceId: body.serviceId ?? null,
      assignedAt: new Date().toISOString()
    });
  }

  public removeRole(_userId: string, _userRoleId: string): Promise<void> {
    return Promise.resolve();
  }
}

// ─── In-Memory Knowledge Repository ───────────────────────────────────────────

export class InMemoryKnowledgeRepository {
  public createDocument(dto: CreateDocumentDto): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
      id: "mock-doc-id",
      title: dto.title,
      sourceType: dto.sourceType,
      languageCode: dto.languageCode,
      approvalStatus: "APPROVED",
      processingStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      departmentId: dto.departmentId ?? null,
      serviceId: dto.serviceId ?? null,
      schemeId: dto.schemeId ?? null,
      uploadedByUserId: dto.uploadedByUserId ?? null,
      approvedByUserId: dto.approvedByUserId ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      sourceReference: dto.sourceReference ?? null,
      checksum: dto.checksum ?? null,
      versionLabel: dto.versionLabel ?? null,
      effectiveFrom: null,
      effectiveUntil: null,
      publishedAt: new Date(),
      approvedAt: null
    };
    return Promise.resolve(doc);
  }

  public updateDocument(id: string, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
      id,
      title: "Updated Mock Doc",
      sourceType: "OFFICIAL_PDF",
      languageCode: "en-IN",
      approvalStatus: "APPROVED",
      processingStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      departmentId: null,
      serviceId: null,
      schemeId: null,
      uploadedByUserId: null,
      approvedByUserId: null,
      sourceUrl: null,
      sourceReference: null,
      checksum: null,
      versionLabel: null,
      effectiveFrom: null,
      effectiveUntil: null,
      publishedAt: new Date(),
      approvedAt: null,
      ...data
    };
    return Promise.resolve(doc);
  }

  public saveChunksAndEmbeddings(): Promise<void> {
    return Promise.resolve();
  }

  public deleteDocument(id: string): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
      id,
      title: "Deleted Mock Doc",
      sourceType: "OFFICIAL_PDF",
      languageCode: "en-IN",
      approvalStatus: "APPROVED",
      processingStatus: "INACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      departmentId: null,
      serviceId: null,
      schemeId: null,
      uploadedByUserId: null,
      approvedByUserId: null,
      sourceUrl: null,
      sourceReference: null,
      checksum: null,
      versionLabel: null,
      effectiveFrom: null,
      effectiveUntil: null,
      publishedAt: new Date(),
      approvedAt: null
    };
    return Promise.resolve(doc);
  }

  public findManyDocuments(): Promise<{ items: KnowledgeDocument[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 });
  }

  public findDocumentById(id: string): Promise<KnowledgeDocument | null> {
    const doc: KnowledgeDocument = {
      id,
      title: "Mock Doc",
      sourceType: "OFFICIAL_PDF",
      languageCode: "en-IN",
      approvalStatus: "APPROVED",
      processingStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      departmentId: null,
      serviceId: null,
      schemeId: null,
      uploadedByUserId: null,
      approvedByUserId: null,
      sourceUrl: null,
      sourceReference: null,
      checksum: null,
      versionLabel: null,
      effectiveFrom: null,
      effectiveUntil: null,
      publishedAt: new Date(),
      approvedAt: null
    };
    return Promise.resolve(doc);
  }

  public searchSimilarChunks(): Promise<SearchResult[]> {
    return Promise.resolve([]);
  }
}

// ─── Fake Access Token Verifier ───────────────────────────────────────────────

class FakeAccessTokenVerifier implements AccessTokenVerifier {
  public constructor(private readonly identitiesByToken: Record<string, AuthenticatedIdentity>) {}

  public verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    const identity = this.identitiesByToken[token];

    if (!identity) {
      return Promise.reject(new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired."));
    }

    return Promise.resolve(identity);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface CreateTestAppOptions {
  authRepository?: AuthRepository;
  accessTokenVerifier?: AccessTokenVerifier;
  seedUsers?: AuthenticatedUser[];
  tokenIdentities?: Record<string, AuthenticatedIdentity>;
  auditRepository?: AuditRepository;
  roleRepository?: RoleRepository;
  userRepository?: UserRepository;
  knowledgeRepository?: unknown;
}

export const createTestApp = (overrides: Partial<AppConfig> = {}, options: CreateTestAppOptions = {}) => {
  const env: AppConfig = { ...baseConfig, ...overrides };
  const logger = pino({ enabled: false });

  const healthService = new HealthService(env);

  // ─── In-memory VoiceRepository stub for tests ───────────────────────────────
  const inMemoryVoiceRepository: VoiceRepository = {
    createCall: (twilioCallSid, callerPhoneNumber) =>
      Promise.resolve({ id: `call-${twilioCallSid}`, twilioCallSid, callerPhoneNumber: callerPhoneNumber ?? null, status: "INITIATED", startedAt: new Date(), connectedAt: null, endedAt: null, durationSeconds: null, confidenceScore: null, escalated: false, assignedDepartmentId: null, languageCode: null, createdAt: new Date(), updatedAt: new Date() } as never),
    updateCall: (_sid, _data) =>
      Promise.resolve({ id: "stub", twilioCallSid: _sid, callerPhoneNumber: null, status: "COMPLETED", startedAt: null, connectedAt: null, endedAt: null, durationSeconds: null, confidenceScore: null, escalated: false, assignedDepartmentId: null, languageCode: null, createdAt: new Date(), updatedAt: new Date() } as never),
    findCallBySid: () => Promise.resolve(null),
    createCallLog: (callId, eventType, message, metadata) =>
      Promise.resolve({ id: "stub-log", callId, eventType, message: message ?? null, metadata: metadata ?? null, createdAt: new Date() } as never),
    createConversationTurn: (callId, turnIndex, speakerRole, content) =>
      Promise.resolve({ id: "stub-turn", callId, turnIndex, speakerRole, languageCode: null, content, confidenceScore: null, metadata: null, createdAt: new Date() } as never),
    createTicket: (callId, title, description) =>
      Promise.resolve({ id: "stub-ticket", callId, title, description, status: "OPEN", priority: "MEDIUM", departmentId: null, assignedToUserId: null, createdAt: new Date(), updatedAt: new Date(), resolvedAt: null } as never),
  };

  const voiceService = new VoiceService(env, logger, inMemoryVoiceRepository);

  const authRepository = options.authRepository ?? new InMemoryAuthRepository(options.seedUsers);
  const accessTokenVerifier =
    options.accessTokenVerifier ?? new FakeAccessTokenVerifier(options.tokenIdentities ?? { "valid-token": defaultIdentity });
  const authService = new AuthService(accessTokenVerifier, authRepository, logger, {
    defaultRoleCode: env.defaultAdminRoleCode,
    superAdminEmails: env.superAdminEmails
  });

  const auditRepository = options.auditRepository ?? new InMemoryAuditRepository();
  const auditService = new AuditService(auditRepository, authService, logger);

  const roleRepository = options.roleRepository ?? new InMemoryRoleRepository();
  const roleService = new RoleService(roleRepository, authService);

  const userRepository = options.userRepository ?? new InMemoryUserRepository();
  const userService = new UserService(userRepository, authService, auditService);

  const knowledgeRepository = (options.knowledgeRepository ?? new InMemoryKnowledgeRepository()) as unknown as KnowledgeRepository;
  const documentParser = new DocumentParserService();
  const geminiService = new GeminiService(env);
  const knowledgeService = new KnowledgeService(
    knowledgeRepository,
    documentParser,
    geminiService,
    authService,
    auditService
  );

  const callSessionService = new CallSessionService();
  const groundingEngine = new GroundingEngine(knowledgeService, geminiService);

  // ─── In-memory CallRepository stub for tests ────────────────────────────────
  const inMemoryCallRepository: CallRepository = {
    findMany: () => Promise.resolve({ data: [], total: 0 }),
    findById: () => Promise.resolve(null),
    countActive: () => Promise.resolve(0),
    countEscalated: () => Promise.resolve(0),
  };
  const callService = new CallService(inMemoryCallRepository, authService);

  // ─── In-memory TicketRepository stub for tests ───────────────────────────────
  const inMemoryTicketRepository: TicketRepository = {
    findMany: () => Promise.resolve({ data: [], total: 0 }),
    findById: () => Promise.resolve(null),
    update: () => Promise.resolve({} as never),
    countPending: () => Promise.resolve(0),
  };
  const ticketService = new TicketService(inMemoryTicketRepository, authService, auditService);

  // ─── In-memory Device & Hydration wiring for tests ──────────────────────────
  const inMemoryDeviceRepository = new InMemoryDeviceRepository();
  const deviceService = new DeviceService(inMemoryDeviceRepository, logger);
  const hydrationService = new HydrationService(
    inMemoryCallRepository,
    inMemoryTicketRepository,
    authService
  );

  const analyticsService = new AnalyticsService({} as any, authService);
  const pushNotificationService = new PushNotificationService(inMemoryDeviceRepository, logger);
  const notificationRepository = {
    findManyByUserId: () => Promise.resolve([]),
    markAsRead: () => Promise.resolve({} as any),
    createNotification: () => Promise.resolve({} as any),
  } as any;
  const notificationService = new NotificationService(
    notificationRepository,
    pushNotificationService,
    authService,
    {} as any
  );

  return {
    app: createApp({
      env,
      logger,
      healthService,
      voiceService,
      authService,
      userService,
      roleService,
      auditService,
      knowledgeService,
      callSessionService,
      groundingEngine,
      callService,
      ticketService,
      deviceService,
      hydrationService,
      analyticsService,
      notificationService,
    }),
    authService,
    auditService,
    roleService,
    userService,
    knowledgeService,
    analyticsService,
    notificationService,
    env
  };
};
