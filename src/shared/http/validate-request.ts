/**
 * validate-request.ts
 *
 * Zod-powered Express middleware factories for request validation.
 *
 * Usage:
 *   router.get("/users", validateQuery(listUsersQuerySchema), controller.list);
 *   router.post("/users", validateBody(createUserBodySchema), controller.create);
 *
 * On validation failure, responds with HTTP 422 and a structured error payload:
 *   { error: "VALIDATION_ERROR", message: "...", fields: { fieldName: ["message"] } }
 */

import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import type { ZodTypeAny } from "zod";

interface FieldErrors {
  [field: string]: string[];
}

interface ValidationErrorResponse {
  error: "VALIDATION_ERROR";
  message: string;
  fields: FieldErrors;
}

const formatZodError = (error: ZodError): FieldErrors => {
  const fields: FieldErrors = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
    const existing = fields[path];

    if (existing) {
      existing.push(issue.message);
    } else {
      fields[path] = [issue.message];
    }
  }

  return fields;
};

/**
 * Validates req.body against the provided Zod schema.
 * Replaces req.body with the parsed (coerced) value on success.
 * Returns 422 on failure.
 */
export const validateBody =
  <T extends ZodTypeAny>(schema: T) =>
  (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      const payload: ValidationErrorResponse = {
        error: "VALIDATION_ERROR",
        message: "Request body validation failed.",
        fields: formatZodError(result.error)
      };
      response.status(422).json(payload);
      return;
    }

    // Replace body with the Zod-parsed (coerced/transformed) value
    request.body = result.data as unknown;
    next();
  };

/**
 * Validates req.query against the provided Zod schema.
 * Attaches parsed value to `parsedQuery` on the request object.
 * Returns 422 on failure.
 *
 * Access the parsed value in a controller via:
 *   (request as Request & { parsedQuery: MySchemaType }).parsedQuery
 */
export const validateQuery =
  <T extends ZodTypeAny>(schema: T) =>
  (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      const payload: ValidationErrorResponse = {
        error: "VALIDATION_ERROR",
        message: "Query parameter validation failed.",
        fields: formatZodError(result.error)
      };
      response.status(422).json(payload);
      return;
    }

    // Attach the parsed query to a well-known custom property.
    // Controllers access it via: (req as Request & { parsedQuery: T }).parsedQuery
    const parsed: unknown = result.data;
    Object.assign(request, { parsedQuery: parsed });
    next();
  };
