import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { Logger } from "pino";

import { AppError } from "../errors/app-error";

export const createErrorHandler =
  (logger: Logger) =>
  (error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
    const requestId = response.getHeader("x-request-id");

    if (error instanceof ZodError) {
      logger.warn(
        {
          err: error.flatten(),
          body: _request.body,
          url: _request.originalUrl,
          requestId
        },
        "Zod validation error"
      );
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request could not be validated.",
          details: error.flatten(),
          requestId
        }
      });
      return;
    }

    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId
        }
      });
      return;
    }

    logger.error({ err: error, requestId }, "Unhandled application error");

    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
        requestId
      }
    });
  };
