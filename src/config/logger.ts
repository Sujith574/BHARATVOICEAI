import pino, { type Logger } from "pino";

import type { AppConfig } from "./env";

export const createLogger = (config: AppConfig): Logger =>
  pino({
    name: config.appName,
    level: config.logLevel,
    base: null,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-twilio-signature",
        "req.body.TWILIO_AUTH_TOKEN",
        "token",
        "callerPhoneNumber",
        "email",
        "phone_number",
        "phoneNumber",
        "password"
      ],
      remove: true
    }
  });
