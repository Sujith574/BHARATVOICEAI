import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../../shared/errors/app-error";
import type { AnalyticsService } from "./analytics.service";

export class AnalyticsController {
  public constructor(private readonly service: AnalyticsService) {}

  public getSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
      }
      const actor = req.authUser;
      const summary = await this.service.getSummary(actor);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  };
}
