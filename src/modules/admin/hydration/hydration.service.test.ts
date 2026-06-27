import { describe, it, expect, vi, beforeEach } from "vitest";
import { HydrationService } from "./hydration.service";
import type { CallRepository } from "../calls/call.repository";
import type { TicketRepository } from "../tickets/ticket.repository";
import type { AuthService } from "../../auth/auth.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { AppError } from "../../../shared/errors/app-error";

const makeActor = (permissions: string[] = ["mobile.dashboard.read"]): AuthenticatedUser => ({
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
  lastLoginAt: undefined
});

describe("HydrationService", () => {
  let callRepository: CallRepository;
  let ticketRepository: TicketRepository;
  let authService: AuthService;
  let service: HydrationService;

  beforeEach(() => {
    callRepository = {
      findMany: vi.fn().mockImplementation(() => Promise.resolve({ data: [], total: 0 })),
      findById: vi.fn().mockImplementation(() => Promise.resolve(null)),
      countActive: vi.fn().mockImplementation(() => Promise.resolve(3)),
      countEscalated: vi.fn().mockImplementation(() => Promise.resolve(1))
    };

    ticketRepository = {
      findMany: vi.fn().mockImplementation(() => Promise.resolve({ data: [], total: 0 })),
      findById: vi.fn().mockImplementation(() => Promise.resolve(null)),
      update: vi.fn().mockImplementation(() => Promise.resolve({} as never)),
      countPending: vi.fn().mockImplementation(() => Promise.resolve(5))
    };

    authService = {
      assertPermission: (actor: AuthenticatedUser, permission: string) => {
        if (!actor.permissions.includes(permission)) {
          throw new AppError(403, "FORBIDDEN", `Missing permission: ${permission}`);
        }
      }
    } as unknown as AuthService;

    service = new HydrationService(callRepository, ticketRepository, authService);
  });

  it("successfully compiles mobile hydration data when actor has permission", async () => {
    const actor = makeActor(["mobile.dashboard.read"]);
    const result = await service.hydrateDashboard(actor);

    expect(result.user.id).toBe(actor.id);
    expect(result.user.email).toBe(actor.email);
    expect(result.stats.activeCallsCount).toBe(3);
    expect(result.stats.pendingTicketsCount).toBe(5);
    expect(result.stats.totalEscalatedCallsCount).toBe(1);
    expect(result.recentCalls).toEqual([]);
    expect(result.recentTickets).toEqual([]);
  });

  it("throws 403 when actor lacks mobile.dashboard.read permission", async () => {
    const actor = makeActor([]);
    await expect(service.hydrateDashboard(actor)).rejects.toThrow(AppError);
  });
});
