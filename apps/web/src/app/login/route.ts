import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

// Redirects the user to AuthKit to sign in.
// Register this URL as the sign-in endpoint in the WorkOS dashboard (Redirects section).
export const GET = async () => {
  const signInUrl = await getSignInUrl();
  return NextResponse.redirect(signInUrl);
};
