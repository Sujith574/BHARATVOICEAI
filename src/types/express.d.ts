import type { AuthenticatedIdentity, AuthenticatedUser } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      authIdentity?: AuthenticatedIdentity;
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
