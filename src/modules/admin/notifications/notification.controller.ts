import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../../shared/errors/app-error";
import type { NotificationService } from "./notification.service";

export class NotificationController {
  public constructor(private readonly service: NotificationService) {}

  public listNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
      }
      const actor = req.authUser;
      const notifications = await this.service.listNotifications(actor);
      res.status(200).json(notifications);
    } catch (error) {
      next(error);
    }
  };

  public markRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated user context is missing.");
      }
      const actor = req.authUser;
      const id = String(req.params["id"]);
      const updated = await this.service.markRead(actor, id);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };
}
