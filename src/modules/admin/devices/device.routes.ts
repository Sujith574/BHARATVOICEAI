import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import { validateBody } from "../../../shared/http/validate-request";
import type { DeviceController } from "./device.controller";
import { registerDeviceBodySchema } from "./device.schemas";

export const createDeviceRouter = (
  authService: AuthService,
  controller: DeviceController
): Router => {
  const router = Router();

  /**
   * POST /admin/devices
   * Register a new FCM device token.
   */
  router.post(
    "/",
    requireAuth(authService),
    validateBody(registerDeviceBodySchema),
    (req, res, next) => { controller.register(req, res, next).catch(next); }
  );

  /**
   * DELETE /admin/devices/:token
   * Unregister an FCM device token.
   */
  router.delete(
    "/:token",
    requireAuth(authService),
    (req, res, next) => { controller.unregister(req, res, next).catch(next); }
  );

  return router;
};
