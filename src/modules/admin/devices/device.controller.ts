import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../shared/errors/app-error";
import type { DeviceService } from "./device.service";
import { registerDeviceBodySchema } from "./device.schemas";

export class DeviceController {
  public constructor(private readonly deviceService: DeviceService) {}

  public register = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated request context was not attached to the request.");
      }

      const body = registerDeviceBodySchema.parse(request.body);
      const result = await this.deviceService.registerDevice(request.authUser, body);

      response.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  public unregister = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated request context was not attached to the request.");
      }

      const token = request.params["token"];
      if (typeof token !== "string" || !token) {
        throw new AppError(400, "BAD_REQUEST", "Token parameter is required and must be a string.");
      }

      const result = await this.deviceService.unregisterDevice(request.authUser, token);

      response.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
