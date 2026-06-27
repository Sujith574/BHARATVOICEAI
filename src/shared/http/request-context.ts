import { randomUUID } from "node:crypto";

import type { Request, Response, NextFunction } from "express";

export const requestContextMiddleware = (_request: Request, response: Response, next: NextFunction): void => {
  const requestId = response.getHeader("x-request-id") ?? randomUUID();
  response.setHeader("x-request-id", requestId);
  next();
};
