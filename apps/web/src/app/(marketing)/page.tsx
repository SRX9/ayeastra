import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";

import { osButton, osButtonPrimary } from "@/components/os/ui";

export default async function Home() {
  const { user } = await withAuth();

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <p className="mb-3 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden className="mr-1.5 text-accent">✦</span>
          AyeAstra
        </p>
        <h1 className="mb-4 text-2xl font-medium">
          An intelligence analyst for business.
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted">
          It watches the outside world, grounds what it finds in your company&apos;s
          context, and tells each team what changed, why it matters, and what to
          do next — with evidence for every claim.
        </p>
        <div className="flex justify-center gap-3">
          {user ? (
            <Link href="/dashboard" className={`${osButtonPrimary} no-underline`}>
              Open AyeAstra
            </Link>
          ) : (
            <>
              <Link href="/signup" className={`${osButtonPrimary} no-underline`}>
                Sign up
              </Link>
              <Link href="/login" className={`${osButton} px-3 py-1.5 no-underline`}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
