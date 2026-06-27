import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import type { HydrationController } from "./hydration.controller";

export const createHydrationRouter = (
  authService: AuthService,
  controller: HydrationController
): Router => {
  const router = Router();

  /**
   * GET /admin/mobile/hydrate
   * Retrieve mobile dashboard hydration stats and recent entries.
   */
  router.get(
    "/hydrate",
    requireAuth(authService),
    (req, res, next) => { controller.hydrate(req, res, next).catch(next); }
  );

  return router;
};
