"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: Route; label: string }[] = [
  { href: "/settings/context", label: "Context" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/modules", label: "Modules" },
  { href: "/settings/learned", label: "Learned" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 border-b border-border pb-2">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 font-mono text-xs no-underline transition-colors ${
              active
                ? "bg-default text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
