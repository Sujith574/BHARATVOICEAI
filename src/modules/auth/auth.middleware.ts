import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import type { AuthService } from "./auth.service";
import type { AuthenticatedIdentity } from "./auth.types";

const extractBearerToken = (request: Request): string => {
  const authorizationHeader = request.get("authorization");

  if (!authorizationHeader) {
    throw new AppError(401, "AUTHORIZATION_HEADER_MISSING", "Authorization header is required.");
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError(401, "AUTHORIZATION_HEADER_INVALID", "Authorization header must use the Bearer scheme.");
  }

  return token;
};

const ensureAuthenticatedIdentity = async (request: Request, authService: AuthService): Promise<AuthenticatedIdentity> => {
  if (request.authIdentity) {
    return request.authIdentity;
  }

  const token = extractBearerToken(request);
  const identity = await authService.verifyAccessToken(token);
  request.authIdentity = identity;
  return identity;
};

export const createRequireAuthenticatedIdentity =
  (authService: AuthService) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    void (async () => {
      try {
        await ensureAuthenticatedIdentity(request, authService);
        next();
      } catch (error) {
        next(error);
      }
    })();
  };

export const createRequireProvisionedUser =
  (authService: AuthService) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const identity = await ensureAuthenticatedIdentity(request, authService);
        request.authUser = await authService.getProvisionedUser(identity);
        next();
      } catch (error) {
        next(error);
      }
    })();
  };

export const createRequirePermission =
  (authService: AuthService, permissionCode: string) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_USER_MISSING", "Provisioned user context was not attached to the request.");
      }

      authService.assertPermission(request.authUser, permissionCode);
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * requireAuth — convenience alias for createRequireProvisionedUser.
 *
 * Verifies the Bearer JWT, loads the provisioned AuthenticatedUser from the database,
 * and attaches it to request.authUser. Used by all admin sub-module routes.
 */
export const requireAuth = (authService: AuthService) => createRequireProvisionedUser(authService);

