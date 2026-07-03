import { randomBytes } from "node:crypto";

/**
 * Evidence share tokens (diff doc): unguessable, revocable (null the column),
 * used by the public read-only /evidence/[id]?t=… route. 256 bits, base64url.
 */
export function mintShareToken(): string {
  return randomBytes(32).toString("base64url");
}
