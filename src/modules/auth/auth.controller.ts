import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import type { AuthService } from "./auth.service";

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public bootstrap = (request: Request, response: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!request.authIdentity) {
          throw new AppError(500, "AUTH_IDENTITY_MISSING", "Authenticated identity was not attached to the request.");
        }

        const user = await this.authService.bootstrapAuthenticatedUser(request.authIdentity, {
          ipAddress: request.ip,
          userAgent: request.get("user-agent") ?? undefined,
          requestId: String(response.getHeader("x-request-id") ?? "")
        });

        response.status(200).json({
          data: {
            user
          }
        });
      } catch (error) {
        next(error);
      }
    })();
  };

  public me = (request: Request, response: Response, next: NextFunction): void => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_USER_MISSING", "Provisioned user context was not attached to the request.");
      }

      response.status(200).json({
        data: {
          user: request.authUser
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
