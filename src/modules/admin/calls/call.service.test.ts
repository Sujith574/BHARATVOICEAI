/**
 * call.service.test.ts
 *
 * Unit tests for CallService.
 *
 * Strategy: stub CallRepository so no DB is involved.
 * Focus areas:
 *  - Permission enforcement (throws 403 when permission is absent)
 *  - Correct delegation to CallRepository
 *  - NOT_FOUND error for missing calls
 *  - PaginationMeta is correctly built
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { CallService } from "./call.service";
import type { CallRepository } from "./call.repository";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import { AppError } from "../../../shared/errors/app-error";
import type { CallDetailResponse, CallResponse } from "./call.schemas";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeCallResponse = (overrides: Partial<CallResponse> = {}): CallResponse => ({
  id: "call-uuid-001",
  twilioCallSid: "CA111",
  callerPhoneNumber: "+91-9876543210",
  languageCode: "en-IN",
  status: "COMPLETED",
  escalated: false,
  startedAt: "2024-01-01T10:00:00.000Z",
  connectedAt: "2024-01-01T10:00:05.000Z",
  endedAt: "2024-01-01T10:05:00.000Z",
  durationSeconds: 295,
  confidenceScore: null,
  assignedDepartmentId: null,
  createdAt: "2024-01-01T10:00:00.000Z",
  updatedAt: "2024-01-01T10:05:00.000Z",
  ...overrides,
});

const makeCallDetailResponse = (overrides: Partial<CallDetailResponse> = {}): CallDetailResponse => ({
  ...makeCallResponse(),
  conversationEntries: [
    {
      id: "turn-001",
      turnIndex: 0,
      speakerRole: "CITIZEN",
      languageCode: "en-IN",
      content: "What is PM-KISAN?",
      confidenceScore: null,
      createdAt: "2024-01-01T10:00:10.000Z",
    },
    {
      id: "turn-002",
      turnIndex: 1,
      speakerRole: "ASSISTANT",
      languageCode: "en-IN",
      content: "PM-KISAN provides ₹6000 annually...",
      confidenceScore: null,
      createdAt: "2024-01-01T10:00:15.000Z",
    },
  ],
  ...overrides,
});

const makeActor = (permissions: string[] = ["calls.read"]): AuthenticatedUser => ({
  id: "user-admin-001",
  authUserId: "auth-001",
  email: "admin@example.gov.in",
  phoneNumber: undefined,
  fullName: "Admin User",
  preferredLanguage: "en-IN",
  stateCode: "AP",
  status: "ACTIVE",
  roles: [{ code: "ADMIN_VIEWER", name: "Admin Viewer", scope: "GLOBAL" }],
  permissions,
  lastLoginAt: undefined,
});

// ─── Stubs ────────────────────────────────────────────────────────────────────

const buildRepositoryStub = (): CallRepository => ({
  findMany: vi.fn().mockImplementation(() => Promise.resolve({ data: [makeCallResponse()], total: 1 })),
  findById: vi.fn().mockImplementation(() => Promise.resolve(makeCallDetailResponse())),
  countActive: vi.fn().mockImplementation(() => Promise.resolve(0)),
  countEscalated: vi.fn().mockImplementation(() => Promise.resolve(0)),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CallService", () => {
  let repository: CallRepository;
  let authService: AuthService;
  let service: CallService;

  beforeEach(() => {
    repository = buildRepositoryStub();
    // Use a minimal AuthService stub that only needs assertPermission
    authService = {
      assertPermission: (actor: AuthenticatedUser, permission: string) => {
        if (!actor.permissions.includes(permission)) {
          throw new AppError(403, "FORBIDDEN", `Missing permission: ${permission}`);
        }
      },
    } as unknown as AuthService;

    service = new CallService(repository, authService);
  });

  // ─── listCalls ─────────────────────────────────────────────────────────────

  describe("listCalls", () => {
    it("returns paginated results when actor has calls.read permission", async () => {
      const actor = makeActor(["calls.read"]);
      const findManySpy = vi.spyOn(repository, "findMany");
      const result = await service.listCalls(actor, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(findManySpy).toHaveBeenCalledTimes(1);
    });

    it("passes filters correctly to the repository", async () => {
      const actor = makeActor(["calls.read"]);
      const findManySpy = vi.spyOn(repository, "findMany");
      await service.listCalls(actor, {
        page: 1,
        pageSize: 10,
        status: "COMPLETED",
        languageCode: "hi-IN",
      });

      expect(findManySpy).toHaveBeenCalledWith(
        { status: "COMPLETED", languageCode: "hi-IN" },
        { page: 1, pageSize: 10 }
      );
    });

    it("throws 403 when actor lacks calls.read permission", async () => {
      const actor = makeActor([]);

      await expect(service.listCalls(actor, { page: 1, pageSize: 20 })).rejects.toThrow(
        AppError
      );
    });
  });

  // ─── getCallById ───────────────────────────────────────────────────────────

  describe("getCallById", () => {
    it("returns call detail with transcript when found", async () => {
      const actor = makeActor(["calls.read"]);
      const result = await service.getCallById(actor, "call-uuid-001");

      expect(result.id).toBe("call-uuid-001");
      expect(result.conversationEntries).toHaveLength(2);
      expect(result.conversationEntries[0]?.speakerRole).toBe("CITIZEN");
      expect(result.conversationEntries[1]?.speakerRole).toBe("ASSISTANT");
    });

    it("throws 404 when call does not exist", async () => {
      const findByIdSpy = vi.spyOn(repository, "findById").mockImplementation(() => Promise.resolve(null));
      const actor = makeActor(["calls.read"]);

      const error = await service.getCallById(actor, "non-existent").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
      expect((error as AppError).code).toBe("CALL_NOT_FOUND");
      expect(findByIdSpy).toHaveBeenCalledTimes(1);
    });

    it("throws 403 when actor lacks calls.read permission", async () => {
      const actor = makeActor([]);

      await expect(service.getCallById(actor, "call-uuid-001")).rejects.toThrow(AppError);
    });
  });
});

