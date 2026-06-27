import { PrismaClient } from "@prisma/client";

import type { AppConfig } from "../../config/env";

export class PrismaService extends PrismaClient {
  public constructor(config: AppConfig) {
    super({
      log: config.prismaQueryLoggingEnabled
        ? [
            { emit: "stdout", level: "query" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" }
          ]
        : [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
    });
  }

  public async checkReadiness(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
