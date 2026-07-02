import { createRemoteJWKSet, jwtVerify } from "jose";

/** Claims carried by a WorkOS AuthKit access token. */
export interface AccessTokenClaims {
  /** WorkOS user id. */
  sub: string;
  /** WorkOS session id. */
  sid: string;
  org_id?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  iss: string;
  exp: number;
  iat: number;
}

export interface TokenVerifierOptions {
  /** WorkOS client id (client_...); selects the environment's JWKS. */
  clientId: string;
  /** Override for custom auth domains. Defaults to the WorkOS-hosted JWKS. */
  jwksUrl?: string;
  /**
   * Optional expected `iss` claim for defense in depth. Leave unset unless you
   * have confirmed the issuer your environment mints (it changes with custom
   * auth domains) — a wrong value rejects every token.
   */
  issuer?: string;
}

/**
 * Returns a verifier for WorkOS access tokens (signature via remote JWKS + expiry).
 * Create once per process — the JWKS is fetched lazily and cached.
 */
export function createTokenVerifier({ clientId, jwksUrl, issuer }: TokenVerifierOptions) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl ?? `https://api.workos.com/sso/jwks/${clientId}`));

  return async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, jwks, { issuer, clockTolerance: 5 });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw new Error("Token is missing required WorkOS claims");
    }
    return payload as unknown as AccessTokenClaims;
  };
}
