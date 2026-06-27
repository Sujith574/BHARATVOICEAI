import type { Logger } from "pino";
import type { DeviceRepository } from "./device.repository";

export interface SentNotificationRecord {
  tokens: string[];
  title: string;
  body: string;
  payload?: Record<string, unknown> | undefined;
  sentAt: Date;
}

export class PushNotificationService {
  public readonly sentNotifications: SentNotificationRecord[] = [];

  public constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly logger: Logger
  ) {}

  public sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    payload?: Record<string, unknown>
  ): Promise<{ successCount: number; failureCount: number }> {
    if (tokens.length === 0) {
      return Promise.resolve({ successCount: 0, failureCount: 0 });
    }

    this.logger.info(
      { tokens, title, body, payload },
      "Sending push notification via mock FCM service"
    );

    this.sentNotifications.push({
      tokens,
      title,
      body,
      payload,
      sentAt: new Date()
    });

    return Promise.resolve({
      successCount: tokens.length,
      failureCount: 0
    });
  }

  public async sendToUser(
    userId: string,
    title: string,
    body: string,
    payload?: Record<string, unknown>
  ): Promise<{ successCount: number; failureCount: number }> {
    const tokens = await this.deviceRepository.findTokensByUserIds([userId]);
    return this.sendToTokens(tokens, title, body, payload);
  }

  public async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    payload?: Record<string, unknown>
  ): Promise<{ successCount: number; failureCount: number }> {
    const tokens = await this.deviceRepository.findTokensByUserIds(userIds);
    return this.sendToTokens(tokens, title, body, payload);
  }
}
