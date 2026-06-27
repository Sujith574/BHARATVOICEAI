import type { PrismaClient } from "@prisma/client";

export interface DeviceRepository {
  upsert(userId: string, token: string, platform: string): Promise<void>;
  findTokensByUserIds(userIds: string[]): Promise<string[]>;
  deleteByToken(token: string): Promise<void>;
}

export class PrismaDeviceRepository implements DeviceRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async upsert(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform
      },
      create: {
        userId,
        token,
        platform
      }
    });
  }

  public async findTokensByUserIds(userIds: string[]): Promise<string[]> {
    const devices = await this.prisma.deviceToken.findMany({
      where: {
        userId: { in: userIds }
      },
      select: {
        token: true
      }
    });
    return devices.map((d) => d.token);
  }

  public async deleteByToken(token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { token }
    });
  }
}

export class InMemoryDeviceRepository implements DeviceRepository {
  // Map of token -> { userId, platform }
  private readonly devices = new Map<string, { userId: string; platform: string }>();

  public upsert(userId: string, token: string, platform: string): Promise<void> {
    this.devices.set(token, { userId, platform });
    return Promise.resolve();
  }

  public findTokensByUserIds(userIds: string[]): Promise<string[]> {
    const tokens: string[] = [];
    for (const [token, data] of this.devices.entries()) {
      if (userIds.includes(data.userId)) {
        tokens.push(token);
      }
    }
    return Promise.resolve(tokens);
  }

  public deleteByToken(token: string): Promise<void> {
    this.devices.delete(token);
    return Promise.resolve();
  }
}
