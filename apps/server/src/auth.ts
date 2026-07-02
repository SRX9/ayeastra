import {
  createTokenVerifier,
  hasRoleAtLeast,
  type AccessTokenClaims,
  type Role,
} from "@ayeastra/auth";
import { env } from "@ayeastra/env/server";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      /** WorkOS access-token claims, set by `requireAuth`. */
      auth?: AccessTokenClaims;
    }
  }
}

const verifyAccessToken = createTokenVerifier({ clientId: env.WORKOS_CLIENT_ID });

/**
 * Verifies the `Authorization: Bearer <token>` WorkOS access token (signature
 * via JWKS + expiry) and attaches its claims to `req.auth`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Scheme name is case-insensitive per RFC 7235.
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    req.auth = await verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Requires `requireAuth` to have run and the org role to be at least `role`. */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!hasRoleAtLeast(req.auth.role, role)) {
      res.status(403).json({ error: `Requires the ${role} role` });
      return;
    }
    next();
  };
}
