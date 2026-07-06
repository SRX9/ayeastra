import { Skeleton } from "@heroui/react";

/** Mirrors the wizard shell so the handoff from skeleton to content is calm. */
export default function OnboardingLoading() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border px-5 py-8 md:flex">
        <div className="grid gap-8">
          <div className="flex items-center gap-2.5 px-2">
            <span aria-hidden className="size-2 rounded-sm bg-accent" />
            <span className="font-mono text-sm tracking-wide">AyeAstra</span>
          </div>
          <div className="grid gap-3 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1">
                <Skeleton className="size-5 rounded" />
                <Skeleton className="h-3 rounded" style={{ width: `${52 + ((i * 17) % 32)}%` }} />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="mx-2 h-3 w-3/4 rounded" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-6 py-3 md:hidden">
          <Skeleton className="h-5 w-32 rounded" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl px-6 pb-24 pt-14 md:pt-24">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="mt-3 h-7 w-2/3 rounded" />
            <Skeleton className="mt-3 h-4 w-full max-w-md rounded" />
            <div className="mt-10 grid gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid gap-2">
                  <Skeleton className="h-3.5 w-28 rounded" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="mt-10 flex justify-end">
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
