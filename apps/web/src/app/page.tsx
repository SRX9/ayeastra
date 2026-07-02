import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";

export default async function Home() {
  const { user } = await withAuth();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">AyeAstra</h1>
      <p className="mb-6 max-w-xl text-sm text-muted">
        An AI intelligence analyst for business: it watches the outside world, grounds what it
        finds in your company&apos;s context, and tells each team what changed, why it matters, and
        what to do next — with evidence for every claim.
      </p>
      <div className="flex gap-4 text-sm">
        {user ? (
          <Link href="/dashboard" className="link underline underline-offset-4">
            Open dashboard
          </Link>
        ) : (
          <>
            <Link href="/login" className="link underline underline-offset-4">
              Sign in
            </Link>
            <Link href="/signup" className="link underline underline-offset-4">
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
