/**
 * Organization roles, ordered from least to most privileged.
 * Slugs must match the roles configured in the WorkOS dashboard.
 * `owner` is reserved for later (PRD: fine-grained roles deferred).
 */
export const ROLES = ["member", "admin", "owner"] as const;

export type Role = (typeof ROLES)[number];

/** Roles that can be assigned when inviting or updating members. */
export const ASSIGNABLE_ROLES = ["member", "admin"] as const satisfies readonly Role[];

export const DEFAULT_ROLE: Role = "member";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True if `actual` is `required` or any role above it. Unknown roles have no privileges. */
export function hasRoleAtLeast(actual: string | undefined, required: Role): boolean {
  if (!isRole(actual)) return false;
  return ROLES.indexOf(actual) >= ROLES.indexOf(required);
}

/**
 * True if an actor with `actorRole` may manage (remove, change the role of) a
 * member holding `targetRole` — i.e. the target does not outrank the actor.
 * Unknown roles on either side can't be managed: their rank is undecidable.
 */
export function canManageRole(actorRole: string | undefined, targetRole: string): boolean {
  if (!isRole(actorRole) || !isRole(targetRole)) return false;
  return ROLES.indexOf(actorRole) >= ROLES.indexOf(targetRole);
}
