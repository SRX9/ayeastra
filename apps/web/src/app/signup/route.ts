import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

// Redirects the user to AuthKit to sign up.
export const GET = async () => {
  const signUpUrl = await getSignUpUrl();
  return NextResponse.redirect(signUpUrl);
};
