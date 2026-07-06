import { X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

const MAX_WIDTHS = {
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

/**
 * Floating OS-style window: hairline border, solid surface, mono title bar.
 * Server component — plain pages render inside it as centered windows over
 * the canvas; the Phase-4 overlay reuses the same look.
 */
export function Window({
  title,
  meta,
  closeHref,
  size = "lg",
  children,
}: {
  title: string;
  /** Small mono annotation on the right of the title bar (id, date, status). */
  meta?: React.ReactNode;
  closeHref?: Route;
  size?: keyof typeof MAX_WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mx-auto w-full ${MAX_WIDTHS[size]} rounded-lg border border-border bg-surface`}
    >
      <header className="flex h-10 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2.5">
          {closeHref && (
            <Link
              href={closeHref}
              aria-label="Close"
              className="flex text-muted no-underline hover:text-foreground print:hidden"
            >
              <X size={14} />
            </Link>
          )}
          <h1 className="font-mono text-xs tracking-wide text-foreground">{title}</h1>
        </div>
        {meta && <div className="font-mono text-xs text-muted">{meta}</div>}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}
