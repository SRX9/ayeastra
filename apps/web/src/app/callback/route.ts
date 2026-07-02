import { getDb, users } from "@ayeastra/db";
import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS redirects here after authentication.
// Must match NEXT_PUBLIC_WORKOS_REDIRECT_URI and the redirect URI in the WorkOS dashboard.
export const GET = handleAuth({
  returnPathname: "/dashboard",
  onSuccess: async ({ user }) => {
    // Mirror the WorkOS user locally. Best effort: sign-in must never fail
    // because the database is down or not configured yet.
    if (!process.env.DATABASE_URL) return;
    try {
      await getDb()
        .insert(users)
        .values({
          workosUserId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePictureUrl: user.profilePictureUrl,
        })
        .onConflictDoUpdate({
          target: users.workosUserId,
          set: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePictureUrl: user.profilePictureUrl,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error("[auth] failed to sync user to database", error);
    }
  },
});
