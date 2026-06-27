import { Router } from "express";
import { createRequirePermission, createRequireProvisionedUser } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import type { AnalyticsController } from "./analytics.controller";

export const createAnalyticsRouter = (
  authService: AuthService,
  controller: AnalyticsController
): Router => {
  const router = Router();

  router.use(createRequireProvisionedUser(authService));

  router.get(
    "/summary",
    createRequirePermission(authService, "analytics.read"),
    controller.getSummary
  );

  return router;
};
