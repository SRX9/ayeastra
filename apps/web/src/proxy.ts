import { authkitProxy } from "@workos-inc/authkit-nextjs";

// Env validation happens in next.config.ts, which runs at every server boot.
export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    // Everything not listed here requires a session before it renders.
    // The Stripe webhook authenticates via signature, not session.
    unauthenticatedPaths: ["/", "/login", "/signup", "/callback", "/api/webhooks/stripe"],
  },
  signUpPaths: ["/signup"],
});

// Run on every route except static assets so sessions stay refreshed app-wide.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
