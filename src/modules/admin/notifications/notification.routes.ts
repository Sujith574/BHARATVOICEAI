import { Router } from "express";
import { createRequirePermission, createRequireProvisionedUser } from "../../auth/auth.middleware";
import type { AuthService } from "../../auth/auth.service";
import type { NotificationController } from "./notification.controller";

export const createNotificationRouter = (
  authService: AuthService,
  controller: NotificationController
): Router => {
  const router = Router();

  router.use(createRequireProvisionedUser(authService));

  router.get(
    "/",
    createRequirePermission(authService, "notifications.read"),
    controller.listNotifications
  );

  router.patch(
    "/:id/read",
    createRequirePermission(authService, "notifications.read"),
    controller.markRead
  );

  return router;
};
