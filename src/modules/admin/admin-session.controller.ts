/**
 * admin-session.controller.ts
 *
 * HTTP controller for session and profile endpoints.
 *
 * Endpoints:
 *   GET /admin/session  — full identity + authUser context (debug / bootstrap verification)
 *   GET /admin/me       — current user profile with roles + permissions (mobile app primary)
 */

import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";

export class AdminSessionController {
  /**
   * GET /admin/session
   *
   * Returns both the raw Supabase identity and the bootstrapped admin user.
   * Useful for client-side auth bootstrapping and debugging.
   */
  public getSession = (request: Request, response: Response, next: NextFunction): void => {
    try {
      if (!request.authUser || !request.authIdentity) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated request context was not attached to the request.");
      }

      response.status(200).json({
        data: {
          user: request.authUser,
          identity: {
            authUserId: request.authIdentity.authUserId,
            email: request.authIdentity.email,
            supabaseRole: request.authIdentity.supabaseRole
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /admin/me
   *
   * Returns the full authenticated user profile: id, email, roles, and permissions.
   * This is the primary endpoint used by the Admin Mobile App on startup.
   */
  public getMe = (request: Request, response: Response, next: NextFunction): void => {
    try {
      if (!request.authUser) {
        throw new AppError(500, "AUTH_CONTEXT_MISSING", "Authenticated request context was not attached to the request.");
      }

      response.status(200).json({
        data: {
          id: request.authUser.id,
          email: request.authUser.email,
          phoneNumber: request.authUser.phoneNumber ?? null,
          fullName: request.authUser.fullName ?? null,
          preferredLanguage: request.authUser.preferredLanguage ?? null,
          stateCode: request.authUser.stateCode ?? null,
          status: request.authUser.status,
          roles: request.authUser.roles,
          permissions: request.authUser.permissions,
          lastLoginAt: request.authUser.lastLoginAt ?? null
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
