/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "./notification.service";
import type { NotificationRepository } from "./notification.repository";
import type { PushNotificationService } from "../devices/push-notification.service";
import type { AuthService } from "../../auth/auth.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import { AppError } from "../../../shared/errors/app-error";

const makeActor = (permissions: string[] = ["notifications.read"]): AuthenticatedUser => ({
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

describe("NotificationService", () => {
  let mockRepository: any;
  let mockPushService: any;
  let mockAuthService: AuthService;
  let mockPrisma: any;
  let service: NotificationService;

  beforeEach(() => {
    mockRepository = {
      findManyByUserId: vi.fn(),
      markAsRead: vi.fn(),
      createNotification: vi.fn(),
    };

    mockPushService = {
      sendToUser: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
    };

    mockAuthService = {
      assertPermission: (actor: AuthenticatedUser, permission: string) => {
        if (!actor.permissions.includes(permission)) {
          throw new AppError(403, "FORBIDDEN", `Missing permission: ${permission}`);
        }
      }
    } as unknown as AuthService;

    mockPrisma = {
      user: {
        findMany: vi.fn(),
      },
    };

    service = new NotificationService(
      mockRepository as unknown as NotificationRepository,
      mockPushService as unknown as PushNotificationService,
      mockAuthService,
      mockPrisma as unknown as PrismaService
    );
  });

  describe("listNotifications", () => {
    it("successfully retrieves user notifications when actor has permission", async () => {
      const actor = makeActor(["notifications.read"]);
      const expectedResult = [{ id: "notif-123", title: "Test", body: "Body", readAt: null }];
      mockRepository.findManyByUserId.mockResolvedValueOnce(expectedResult);

      const result = await service.listNotifications(actor);

      expect(result).toEqual(expectedResult);
      expect(mockRepository.findManyByUserId).toHaveBeenCalledWith(actor.id);
    });

    it("throws 403 when lacking permission", async () => {
      const actor = makeActor([]);
      await expect(service.listNotifications(actor)).rejects.toThrow(AppError);
    });
  });

  describe("markRead", () => {
    it("successfully marks a notification as read", async () => {
      const actor = makeActor(["notifications.read"]);
      const expectedResult = { id: "notif-123", readAt: new Date() };
      mockRepository.markAsRead.mockResolvedValueOnce(expectedResult);

      const result = await service.markRead(actor, "notif-123");

      expect(result).toEqual(expectedResult);
      expect(mockRepository.markAsRead).toHaveBeenCalledWith("notif-123", actor.id);
    });
  });

  describe("broadcastToAdmins", () => {
    it("successfully creates database notifications and sends push notifications to all active admins", async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: "admin-1" },
        { id: "admin-2" }
      ]);

      await service.broadcastToAdmins("TICKET", "Title", "Body", { info: "data" });

      expect(mockRepository.createNotification).toHaveBeenCalledTimes(2);
      expect(mockRepository.createNotification).toHaveBeenCalledWith("admin-1", "TICKET", "Title", "Body", { info: "data" });
      expect(mockRepository.createNotification).toHaveBeenCalledWith("admin-2", "TICKET", "Title", "Body", { info: "data" });

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(mockPushService.sendToUser).toHaveBeenCalledWith("admin-1", "Title", "Body", { info: "data" });
      expect(mockPushService.sendToUser).toHaveBeenCalledWith("admin-2", "Title", "Body", { info: "data" });
    });
  });
});
