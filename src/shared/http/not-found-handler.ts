import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error";

export const notFoundHandler = (request: Request, _response: Response, next: NextFunction): void => {
  next(
    new AppError(404, "ROUTE_NOT_FOUND", `No route registered for ${request.method} ${request.originalUrl}.`)
  );
};
