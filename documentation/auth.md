# Auth & User Management

WorkOS AuthKit is the system of record for users, organizations, memberships, roles, and invitations. Our code adds session guards, org onboarding, seat-limited team management, and API token verification — nothing is duplicated locally except an optional `users` mirror table.

## One-time WorkOS dashboard setup

All in the [WorkOS dashboard](https://dashboard.workos.com) (staging environment first):

1. **Redirects** → set the redirect URI to `http://localhost:3000/callback` (must exactly match `NEXT_PUBLIC_WORKOS_REDIRECT_URI`). Set the app homepage URL to `http://localhost:3000`.
2. **Authentication** → enable **Google OAuth** (staging works out of the box with WorkOS demo credentials; production needs your own Google client). Disable methods you don't want (e.g. password) — no code change either way. Enterprise SSO/SAML/SCIM are enabled here later, also without code changes.
3. **Roles** (Organizations → Roles) → make sure these exist with **exactly these slugs**:
   - `member` — the environment default role (invited users land here unless invited as admin).
   - `admin` — created if missing. The org creator gets this role; org creation fails without it.
4. **Invitations** → ensure invitation emails are enabled (default in staging; production needs a from-domain).

Env vars live in `apps/web/.env` / `apps/server/.env` (see the `.env.example` files). All are validated at boot by `packages/env` — the app fails fast on a missing key or a cookie password under 32 chars.

## How auth flows work

- **Sign-in / sign-up**: `/login` and `/signup` redirect to the AuthKit hosted page (Google button lives there). WorkOS redirects back to `/callback`, which stores the encrypted session cookie and (best-effort) mirrors the user into Postgres.
- **Onboarding**: `/dashboard` requires an organization. Users without one are redirected to `/onboarding`, which creates a WorkOS org (creator becomes `admin`) with `metadata: { plan: "team", seatLimit: "5" }`. If the user already belongs to an org, they're switched into it instead — one org per user at launch.
- **Invited users**: the invitation email takes them through AuthKit sign-up; WorkOS activates their membership and their session carries the org + role automatically — they land straight on `/dashboard`.
- **Seats**: seat limit lives in org metadata (single source of truth until billing exists; a billing webhook will update it later). Used seats = active members + pending invitations. Invites are blocked when full.
- **Route protection**: `apps/web/src/proxy.ts` requires a session for every route except `/`, `/login`, `/signup`, `/callback`.

## Using auth in code

**Server components / actions / route handlers** (`apps/web/src/lib/auth.ts`):

```ts
const session = await requireAuth();        // signed-in user, else redirect to sign-in
const session = await requireOrg();         // + organizationId, else redirect to /onboarding

const session = await requireRole("admin"); // + role check — action-safe, never throws
if ("error" in session) return session;     // surface to the form instead of an error page
```

`session` carries `user`, `organizationId`, `role`, `permissions`, and `accessToken` (forward the access token as a Bearer header when calling the Express API).

**Client components**: `useAuth()` from `@workos-inc/authkit-nextjs/components` is the auth context (`user`, `organizationId`, `role`, `loading`, `signOut`, `switchToOrganization`). `useAccessToken()` returns a token for API calls. See `apps/web/src/components/user-menu.tsx`.

**Role checks anywhere**: `hasRoleAtLeast(role, "admin")` from `@ayeastra/auth` (`member` < `admin` < `owner`; `owner` is reserved until fine-grained roles ship).

**Express API** (`apps/server/src/auth.ts`): JWT verification against WorkOS JWKS — no API key or session needed on the server.

```ts
app.get("/api/thing", requireAuth, requireRole("admin"), (req, res) => {
  req.auth; // { sub, sid, org_id, role, permissions, ... }
});
```

## Known behavior & deferred work

- Removing a member doesn't kill their already-issued access token; they lose access when it expires (minutes) and the session fails to refresh.
- Seat checks read-then-write without a lock; two simultaneous invites could overshoot by one. Irrelevant at current scale.
- Member management guards: admins can't act on themselves, can't manage a member whose role outranks theirs, and can't remove or demote the last admin. A near-simultaneous mutual removal of two admins remains theoretically possible (no transactions across the WorkOS API).
- Deferred (per PRD): fine-grained roles (`owner`, analyst/viewer), SCIM, audit log, multi-org switching UI, billing-driven seat updates.
