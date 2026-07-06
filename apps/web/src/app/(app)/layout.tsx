import { OsShell } from "@/components/os/os-shell";
import type { SystemStatus } from "@/components/os/menu-bar";
import { requireAuth } from "@/lib/auth";
import { watchStats } from "@/lib/intel";
import { listOpenActions } from "@/lib/outcomes";

/**
 * OS shell for all authenticated app surfaces. Only a light auth guard runs
 * here — the strict org/subscription gates stay in the pages, which may
 * redirect to onboarding or billing before this chrome ever matters.
 */
export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const session = await requireAuth();

  let status: SystemStatus | null = null;
  if (session.organizationId) {
    // Menu-bar telemetry is best effort; never block the page on it.
    status = await Promise.all([
      watchStats(session.organizationId),
      listOpenActions(session.organizationId),
    ])
      .then(([stats, actions]) => ({ ...stats, actionCount: actions.length }))
      .catch(() => null);
  }

  return (
    <OsShell status={status}>
      <main className="mx-auto w-full max-w-5xl px-6 pt-16 pb-32">{children}</main>
      {modal}
    </OsShell>
  );
}
