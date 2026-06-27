import type { Notification, NotificationType, Prisma } from "@prisma/client";
import type { PrismaService } from "../../../shared/prisma/prisma.service";

export class NotificationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findManyByUserId(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  public async markAsRead(id: string, userId: string): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  public async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    metadata?: Record<string, unknown>
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
