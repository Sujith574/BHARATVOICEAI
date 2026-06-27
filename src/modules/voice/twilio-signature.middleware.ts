import type { NextFunction, Request, Response } from "express";
import { validateRequest } from "twilio";

import type { AppConfig } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";

const toValidationParams = (body: unknown): Record<string, string> => {
  if (!body || typeof body !== "object") {
    return {};
  }

  return Object.entries(body as Record<string, unknown>).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (typeof value === "string") {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
};

const getRequestUrl = (request: Request): string => {
  const host = request.get("host");

  if (!host) {
    throw new AppError(400, "MISSING_HOST_HEADER", "Host header is required for Twilio request validation.");
  }

  return `${request.protocol}://${host}${request.originalUrl}`;
};

export const createTwilioSignatureMiddleware =
  (config: AppConfig) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    if (!config.twilioSignatureValidationEnabled) {
      next();
      return;
    }

    const signature = request.get("x-twilio-signature");

    if (!signature) {
      next(new AppError(401, "TWILIO_SIGNATURE_MISSING", "Twilio signature header is missing."));
      return;
    }

    const isValid = validateRequest(
      config.twilioAuthToken ?? "",
      signature,
      getRequestUrl(request),
      toValidationParams(request.body)
    );

    if (!isValid) {
      next(new AppError(401, "TWILIO_SIGNATURE_INVALID", "Twilio request signature validation failed."));
      return;
    }

    next();
  };
