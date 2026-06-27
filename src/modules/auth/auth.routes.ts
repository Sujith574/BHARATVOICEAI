import { Router } from "express";

import type { AuthController } from "./auth.controller";
import { createRequireAuthenticatedIdentity, createRequireProvisionedUser } from "./auth.middleware";
import type { AuthService } from "./auth.service";

export const createAuthRouter = (authService: AuthService, controller: AuthController): Router => {
  const router = Router();

  router.post("/bootstrap", createRequireAuthenticatedIdentity(authService), controller.bootstrap);
  router.get("/me", createRequireProvisionedUser(authService), controller.me);

  return router;
};
