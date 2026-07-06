"use client";

import { Kbd } from "@heroui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { UserMenu } from "@/components/user-menu";

export interface SystemStatus {
  entityCount: number;
  sourceCount: number;
  actionCount: number;
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return null;
  return (
    <span className="tabular-nums">
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

export function MenuBar({
  status,
  onOpenPalette,
}: {
  status: SystemStatus | null;
  onOpenPalette: () => void;
}) {
  const healthy = (status?.sourceCount ?? 0) > 0;

  return (
    <header className="os-chrome fixed inset-x-0 top-0 z-40 flex h-9 items-center justify-between border-b border-border bg-background/85 px-3 backdrop-blur print:hidden">
      <Link
        href="/dashboard"
        className="font-mono text-xs tracking-wide text-foreground no-underline"
      >
        <span aria-hidden className="mr-1.5 text-accent">
          ✦
        </span>
        AyeAstra
      </Link>

      <div className="flex items-center gap-4 font-mono text-xs text-muted">
        {status && (
          <span className="flex items-center gap-1.5" title="Watch pipeline">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-success" : "bg-warning"}`}
            />
            {status.entityCount} watched · {status.sourceCount} sources
          </span>
        )}
        {status && status.actionCount > 0 && (
          <Link href="/dashboard" className="text-muted no-underline hover:text-foreground">
            {status.actionCount} open action{status.actionCount === 1 ? "" : "s"}
          </Link>
        )}
        <Clock />
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 text-muted hover:text-foreground"
          aria-label="Open command palette"
        >
          <Kbd>
            <Kbd.Abbr keyValue="command" />
            <Kbd.Content>K</Kbd.Content>
          </Kbd>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
