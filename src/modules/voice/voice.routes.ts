import express, { Router } from "express";

import type { AppConfig } from "../../config/env";
import type { VoiceController } from "./voice.controller";
import { createTwilioSignatureMiddleware } from "./twilio-signature.middleware";

export const createVoiceRouter = (config: AppConfig, controller: VoiceController): Router => {
  const router = Router();
  const formParser = express.urlencoded({ extended: false });
  const validateTwilioSignature = createTwilioSignatureMiddleware(config);

  router.post("/twilio/incoming", formParser, validateTwilioSignature, controller.handleIncomingCall);
  router.post("/twilio/status", formParser, validateTwilioSignature, controller.handleStatusCallback);

  return router;
};
