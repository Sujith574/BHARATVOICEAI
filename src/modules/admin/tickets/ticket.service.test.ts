/**
 * ticket.service.test.ts
 *
 * Unit tests for TicketService.
 *
 * Strategy: stub TicketRepository and AuditService so no DB is involved.
 * Focus areas:
 *  - Permission enforcement (throws 403 when permission is absent)
 *  - Correct delegation to TicketRepository
 *  - NOT_FOUND error for list/get/update operations
 *  - Audit log written on every successful update
 *  - PaginationMeta is correctly built
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { TicketService } from "./ticket.service";
import type { TicketRepository } from "./ticket.repository";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { AuditService } from "../audit/audit.service";
import { AppError } from "../../../shared/errors/app-error";
import type { TicketResponse } from "./ticket.schemas";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTicket = (overrides: Partial<TicketResponse> = {}): TicketResponse => ({
  id: "ticket-uuid-001",
  callId: "call-uuid-001",
  departmentId: null,
  assignedToUserId: null,
  title: "Unresolved citizen query escalation",
  description: "Citizen query: What is Aadhaar?",
  priority: "MEDIUM",
  status: "OPEN",
  createdAt: "2024-01-01T10:05:00.000Z",
  updatedAt: "2024-01-01T10:05:00.000Z",
  resolvedAt: null,
  ...overrides,
});

const makeActor = (permissions: string[] = ["tickets.read", "tickets.manage"]): AuthenticatedUser => ({
  id: "user-admin-001",
  authUserId: "auth-001",
  email: "admin@example.gov.in",
  phoneNumber: undefined,
  fullName: "Admin User",
  preferredLanguage: "en-IN",
  stateCode: "AP",
  status: "ACTIVE",
  roles: [{ code: "SUPER_ADMIN", name: "Super Admin", scope: "GLOBAL" }],
  permissions,
  lastLoginAt: undefined,
});

// ─── Stubs ────────────────────────────────────────────────────────────────────

const buildRepositoryStub = (): TicketRepository => ({
  findMany: vi.fn().mockImplementation(() => Promise.resolve({ data: [makeTicket()], total: 1 })),
  findById: vi.fn().mockImplementation(() => Promise.resolve(makeTicket())),
  update: vi.fn().mockImplementation(() => Promise.resolve(makeTicket({ status: "IN_PROGRESS" }))),
  countPending: vi.fn().mockImplementation(() => Promise.resolve(0)),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TicketService", () => {
  let repository: TicketRepository;
  let authService: AuthService;
  let auditService: AuditService;
  let service: TicketService;

  beforeEach(() => {
    repository = buildRepositoryStub();

    authService = {
      assertPermission: (actor: AuthenticatedUser, permission: string) => {
        if (!actor.permissions.includes(permission)) {
          throw new AppError(403, "FORBIDDEN", `Missing permission: ${permission}`);
        }
      },
    } as unknown as AuthService;

    auditService = {
      log: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
    } as unknown as AuditService;

    service = new TicketService(repository, authService, auditService);
  });

  // ─── listTickets ───────────────────────────────────────────────────────────

  describe("listTickets", () => {
    it("returns paginated results when actor has tickets.read permission", async () => {
      const actor = makeActor(["tickets.read"]);
      const findManySpy = vi.spyOn(repository, "findMany");
      const result = await service.listTickets(actor, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(findManySpy).toHaveBeenCalledTimes(1);
    });

    it("passes all filters to the repository", async () => {
      const actor = makeActor(["tickets.read"]);
      const findManySpy = vi.spyOn(repository, "findMany");
      await service.listTickets(actor, {
        page: 1,
        pageSize: 10,
        status: "OPEN",
        priority: "HIGH",
        callId: "call-uuid-001",
      });

      expect(findManySpy).toHaveBeenCalledWith(
        { status: "OPEN", priority: "HIGH", callId: "call-uuid-001" },
        { page: 1, pageSize: 10 }
      );
    });

    it("throws 403 when actor lacks tickets.read", async () => {
      const actor = makeActor([]);

      await expect(service.listTickets(actor, { page: 1, pageSize: 20 })).rejects.toThrow(AppError);
    });
  });

  // ─── getTicketById ─────────────────────────────────────────────────────────

  describe("getTicketById", () => {
    it("returns the ticket when found", async () => {
      const actor = makeActor(["tickets.read"]);
      const result = await service.getTicketById(actor, "ticket-uuid-001");

      expect(result.id).toBe("ticket-uuid-001");
      expect(result.status).toBe("OPEN");
    });

    it("throws 404 when ticket does not exist", async () => {
      const findByIdSpy = vi.spyOn(repository, "findById").mockImplementation(() => Promise.resolve(null));
      const actor = makeActor(["tickets.read"]);

      const error = await service.getTicketById(actor, "non-existent").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
      expect((error as AppError).code).toBe("TICKET_NOT_FOUND");
      expect(findByIdSpy).toHaveBeenCalledTimes(1);
    });

    it("throws 403 when actor lacks tickets.read", async () => {
      const actor = makeActor([]);

      await expect(service.getTicketById(actor, "ticket-uuid-001")).rejects.toThrow(AppError);
    });
  });

  // ─── updateTicket ──────────────────────────────────────────────────────────

  describe("updateTicket", () => {
    it("updates the ticket and returns the updated record", async () => {
      const actor = makeActor(["tickets.read", "tickets.manage"]);
      const updateSpy = vi.spyOn(repository, "update");
      const result = await service.updateTicket(actor, "ticket-uuid-001", { status: "IN_PROGRESS" });

      expect(result.status).toBe("IN_PROGRESS");
      expect(updateSpy).toHaveBeenCalledWith("ticket-uuid-001", { status: "IN_PROGRESS" });
    });

    it("writes an audit log entry on successful update", async () => {
      const actor = makeActor(["tickets.read", "tickets.manage"]);
      const auditSpy = vi.spyOn(auditService, "log");
      await service.updateTicket(actor, "ticket-uuid-001", { status: "RESOLVED" });

      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: actor.id,
          entityType: "TICKET",
          entityId: "ticket-uuid-001",
          action: "TICKET_UPDATED",
          metadata: expect.objectContaining({
            previousStatus: "OPEN",
            newStatus: "RESOLVED",
          }) as Record<string, unknown>,
        })
      );
    });

    it("throws 404 when ticket does not exist before updating", async () => {
      const findByIdSpy = vi.spyOn(repository, "findById").mockImplementation(() => Promise.resolve(null));
      const updateSpy = vi.spyOn(repository, "update");
      const actor = makeActor(["tickets.read", "tickets.manage"]);

      const error = await service.updateTicket(actor, "non-existent", { status: "CLOSED" }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
      // repository.update must NOT have been called
      expect(updateSpy).not.toHaveBeenCalled();
      expect(findByIdSpy).toHaveBeenCalledTimes(1);
    });

    it("throws 403 when actor lacks tickets.manage", async () => {
      const actor = makeActor(["tickets.read"]);

      await expect(
        service.updateTicket(actor, "ticket-uuid-001", { status: "IN_PROGRESS" })
      ).rejects.toThrow(AppError);
    });

    it("does not write audit log when update fails due to missing permission", async () => {
      const actor = makeActor([]);
      const auditSpy = vi.spyOn(auditService, "log");

      await service.updateTicket(actor, "ticket-uuid-001", { status: "CLOSED" }).catch(() => null);

      expect(auditSpy).not.toHaveBeenCalled();
    });
  });
});

