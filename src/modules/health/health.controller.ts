import type { Request, Response } from "express";

import type { HealthService } from "./health.service";

export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  public getLive = (_request: Request, response: Response): void => {
    response.status(200).json(this.healthService.getLiveStatus());
  };

  public getReady = async (_request: Request, response: Response): Promise<void> => {
    const readiness = await this.healthService.getReadyStatus();
    const httpStatus = readiness.dependencies.some((dependency) => dependency.status === "not_ready") ? 503 : 200;
    response.status(httpStatus).json(readiness);
  };
}
