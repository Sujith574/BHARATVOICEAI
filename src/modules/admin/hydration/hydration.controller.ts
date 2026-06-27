import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../shared/errors/app-error";
import type { HydrationService } from "./hydration.service";

export class HydrationController {
  public constructor(private readonly hydrationService: HydrationService) {}

  public hydrate = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated request context was not attached to the request.");
      }

      const data = await this.hydrationService.hydrateDashboard(request.authUser);

      response.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };
}
