import { Router } from "express";

import type { HealthController } from "./health.controller";

export const createHealthRouter = (controller: HealthController): Router => {
  const router = Router();

  router.get("/live", controller.getLive);
  router.get("/ready", controller.getReady);

  return router;
};
