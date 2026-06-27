import type { Notification, NotificationType } from "@prisma/client";
import type { NotificationRepository } from "./notification.repository";
import type { PushNotificationService } from "../devices/push-notification.service";
import type { AuthService } from "../../auth/auth.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { PrismaService } from "../../../shared/prisma/prisma.service";

export class NotificationService {
  public constructor(
    private readonly repository: NotificationRepository,
    private readonly pushService: PushNotificationService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Retrieves all notifications for the authenticated user.
   * Requires: notifications.read (or matching scope)
   */
  public async listNotifications(actor: AuthenticatedUser): Promise<Notification[]> {
    this.authService.assertPermission(actor, "notifications.read");
    return this.repository.findManyByUserId(actor.id);
  }

  /**
   * Marks a user's notification as read.
   * Requires: notifications.read
   */
  public async markRead(actor: AuthenticatedUser, id: string): Promise<Notification> {
    this.authService.assertPermission(actor, "notifications.read");
    return this.repository.markAsRead(id, actor.id);
  }

  /**
   * Broadcasts a notification to all active system administrators.
   */
  public async broadcastToAdmins(
    type: NotificationType,
    title: string,
    body: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Find all active admin users in the system
    const admins = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    for (const admin of admins) {
      try {
        await this.repository.createNotification(admin.id, type, title, body, metadata);
        // Async dispatch push notification (suppress failure to keep flow running)
        void this.pushService.sendToUser(admin.id, title, body, metadata).catch(() => {});
      } catch (err) {
        // Log locally or handle gracefully
        console.error(`Failed to dispatch alert to admin: ${admin.id}`, err);
      }
    }
  }
}
