import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Logger } from "pino";

import { AppError } from "../../shared/errors/app-error";
import { supabaseAccessTokenClaimsSchema } from "./auth.schemas";
import type { AccessTokenVerifier, AuthenticatedIdentity } from "./auth.types";

export interface SupabaseJwtVerifierConfig {
  audience: string;
  issuer: string;
  jwksUrl: string;
}

const getFullNameFromMetadata = (userMetadata: Record<string, unknown>): string | undefined => {
  const candidateKeys = ["full_name", "name", "display_name"];

  for (const key of candidateKeys) {
    const value = userMetadata[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

export class SupabaseJwtVerifier implements AccessTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  public constructor(
    private readonly config: SupabaseJwtVerifierConfig,
    private readonly logger: Logger
  ) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  }

  public async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience
      });
      const claims = supabaseAccessTokenClaimsSchema.parse(payload);

      return {
        authUserId: claims.sub,
        email: claims.email.toLowerCase(),
        phoneNumber: claims.phone,
        fullName: getFullNameFromMetadata(claims.user_metadata),
        supabaseRole: claims.role,
        appMetadata: claims.app_metadata,
        userMetadata: claims.user_metadata
      };
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to verify Supabase access token");
      throw new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.");
    }
  }
}
