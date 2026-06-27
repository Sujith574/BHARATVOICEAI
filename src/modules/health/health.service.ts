import type { AppConfig } from "../../config/env";

export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export interface ReadinessDependencyStatus {
  name: string;
  status: "ready" | "not_ready";
}

export interface HealthStatus {
  status: "live" | "ready";
  service: string;
  version: string;
  environment: AppConfig["nodeEnv"];
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessStatus extends HealthStatus {
  dependencies: ReadinessDependencyStatus[];
}

export class HealthService {
  public constructor(
    private readonly config: AppConfig,
    private readonly readinessChecks: ReadinessCheck[] = []
  ) {}

  public getLiveStatus(): HealthStatus {
    return this.buildStatus("live");
  }

  public async getReadyStatus(): Promise<ReadinessStatus> {
    const dependencies = await Promise.all(
      this.readinessChecks.map(async (dependency) => {
        try {
          await dependency.check();
          return {
            name: dependency.name,
            status: "ready"
          } satisfies ReadinessDependencyStatus;
        } catch {
          return {
            name: dependency.name,
            status: "not_ready"
          } satisfies ReadinessDependencyStatus;
        }
      })
    );

    return {
      ...this.buildStatus("ready"),
      dependencies
    };
  }

  private buildStatus(status: HealthStatus["status"]): HealthStatus {
    return {
      status,
      service: this.config.appName,
      version: this.config.appVersion,
      environment: this.config.nodeEnv,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString()
    };
  }
}
