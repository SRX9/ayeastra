"use client";

import {
  Activity,
  Building2,
  FileText,
  MessageCircle,
  Settings2,
  Target,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface DockItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  match: string;
}

const ITEMS: DockItem[] = [
  { href: "/dashboard", label: "Feed", icon: Activity, match: "/dashboard" },
  { href: "/entities", label: "Entities", icon: Building2, match: "/entities" },
  { href: "/briefings", label: "Briefings", icon: FileText, match: "/briefings" },
  { href: "/missions", label: "Missions", icon: Target, match: "/missions" },
  { href: "/ask", label: "Ask", icon: MessageCircle, match: "/ask" },
  { href: "/settings/context", label: "Settings", icon: Settings2, match: "/settings" },
];

export function Dock() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  return (
    <nav
      aria-label="Dock"
      className="os-chrome fixed bottom-4 left-1/2 z-40 -translate-x-1/2 print:hidden"
    >
      <div className="flex items-end gap-1 rounded-2xl border border-border bg-surface/80 px-2 py-1.5 backdrop-blur-xl">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = pathname.startsWith(match);
          return (
            <motion.div
              key={href}
              className="group relative"
              whileHover={reducedMotion ? undefined : { scale: 1.18, y: -5 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex rounded-xl p-2.5 no-underline ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={20} strokeWidth={1.75} />
              </Link>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-overlay px-2 py-0.5 font-mono text-[10px] text-foreground group-hover:block"
              >
                {label}
              </span>
              {active && (
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </nav>
  );
}
