/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsService } from "./analytics.service";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { AuthService } from "../../auth/auth.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { AppError } from "../../../shared/errors/app-error";

const makeActor = (permissions: string[] = ["analytics.read"]): AuthenticatedUser => ({
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

describe("AnalyticsService", () => {
  let mockPrisma: any;
  let mockAuthService: AuthService;
  let service: AnalyticsService;

  beforeEach(() => {
    mockPrisma = {
      call: {
        count: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      conversationHistory: {
        findMany: vi.fn(),
      },
    };

    mockAuthService = {
      assertPermission: (actor: AuthenticatedUser, permission: string) => {
        if (!actor.permissions.includes(permission)) {
          throw new AppError(403, "FORBIDDEN", `Missing permission: ${permission}`);
        }
      }
    } as unknown as AuthService;

    service = new AnalyticsService(mockPrisma as unknown as PrismaService, mockAuthService);
  });

  it("successfully returns analytics summary when actor has permissions", async () => {
    mockPrisma.call.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2)  // escalated
      .mockResolvedValueOnce(1); // failed

    mockPrisma.call.aggregate
      .mockResolvedValueOnce({ _avg: { durationSeconds: 65 } })  // average duration
      .mockResolvedValueOnce({ _avg: { confidenceScore: 0.85 } }); // average confidence

    mockPrisma.call.groupBy.mockResolvedValueOnce([
      { languageCode: "hi-IN", _count: { id: 7 } },
      { languageCode: "en-IN", _count: { id: 3 } }
    ]);

    mockPrisma.conversationHistory.findMany.mockResolvedValueOnce([
      { content: "How to apply for PM-KISAN?" },
      { content: "What is the status of my application?" }
    ]);

    const actor = makeActor(["analytics.read"]);
    const result = await service.getSummary(actor);

    expect(result.totalCalls).toBe(10);
    expect(result.averageDuration).toBe(65);
    expect(result.averageConfidence).toBe(0.85);
    expect(result.escalationRate).toBe(20.0);
    expect(result.failureRate).toBe(10.0);
    expect(result.languageDistribution).toEqual([
      { language: "hi-IN", count: 7 },
      { language: "en-IN", count: 3 }
    ]);
    expect(result.topQuestions).toEqual([
      "How to apply for PM-KISAN?",
      "What is the status of my application?"
    ]);
  });

  it("throws 403 when actor lacks permissions", async () => {
    const actor = makeActor([]);
    await expect(service.getSummary(actor)).rejects.toThrow(AppError);
  });

  it("should return cached summary on subsequent calls", async () => {
    mockPrisma.call.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2)  // escalated
      .mockResolvedValueOnce(1); // failed

    mockPrisma.call.aggregate
      .mockResolvedValueOnce({ _avg: { durationSeconds: 65 } })
      .mockResolvedValueOnce({ _avg: { confidenceScore: 0.85 } });

    mockPrisma.call.groupBy.mockResolvedValueOnce([
      { languageCode: "hi-IN", _count: { id: 7 } }
    ]);

    mockPrisma.conversationHistory.findMany.mockResolvedValueOnce([]);

    const actor = makeActor(["analytics.read"]);
    const res1 = await service.getSummary(actor);
    const res2 = await service.getSummary(actor);

    expect(res2).toEqual(res1);
    // Prisma count should only be called once since res2 is cached
    expect(mockPrisma.call.count).toHaveBeenCalledTimes(3); // 3 queries on first fetch
  });
});
