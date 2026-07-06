"use client";

import { Kbd } from "@heroui/react";
import { Command } from "@heroui-pro/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { paletteSearch, type PaletteResult } from "./actions";

const NAV_GROUPS: { heading: string; items: { label: string; href: Route }[] }[] = [
  {
    heading: "Navigate",
    items: [
      { label: "Feed", href: "/dashboard" },
      { label: "Entities", href: "/entities" },
      { label: "Briefings", href: "/briefings" },
      { label: "Missions", href: "/missions" },
      { label: "Ask", href: "/ask" },
    ],
  },
  {
    heading: "Documents",
    items: [
      { label: "Reports", href: "/reports" },
      { label: "Board Mode", href: "/board" },
    ],
  },
  {
    heading: "Settings",
    items: [
      { label: "Business Context", href: "/settings/context" },
      { label: "Billing", href: "/settings/billing" },
      { label: "Team", href: "/settings/team" },
      { label: "Modules", href: "/settings/modules" },
      { label: "Learned Behavior", href: "/settings/learned" },
      { label: "Admin", href: "/admin" },
    ],
  },
];

export function CommandPalette({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [, startTransition] = useTransition();

  const go = (href: Route) => {
    onOpenChange(false);
    router.push(href);
  };

  // Reset search state whenever the palette closes.
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Debounced org-object search; static commands filter locally.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        setResults(await paletteSearch(q));
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const resultGroups = [...new Set(results.map((r) => r.group))].map((group) => ({
    group,
    items: results.filter((r) => r.group === group),
  }));

  return (
    <Command.Root>
      <Command.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Command.Container>
          <Command.Dialog inputValue={query} onInputChange={setQuery}>
            <Command.InputGroup>
              <Command.InputGroup.Prefix>
                <Search size={16} aria-hidden />
              </Command.InputGroup.Prefix>
              <Command.InputGroup.Input placeholder="Go to…" />
            </Command.InputGroup>
            <Command.List>
              {resultGroups.map(({ group, items }) => (
                <Command.Group key={group} heading={group}>
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      id={item.href}
                      textValue={item.label}
                      onAction={() => go(item.href as Route)}
                    >
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              {NAV_GROUPS.map((group) => (
                <Command.Group key={group.heading} heading={group.heading}>
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.href}
                      id={item.href}
                      textValue={item.label}
                      onAction={() => go(item.href)}
                    >
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              <Command.Group heading="Session">
                <Command.Item
                  id="sign-out"
                  textValue="Sign out"
                  onAction={() => void signOut({ returnTo: "/" })}
                >
                  Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
            <Command.Footer>
              <span className="flex items-center gap-2 text-xs text-muted">
                <Kbd>
                  <Kbd.Abbr keyValue="enter" />
                </Kbd>
                open
                <Kbd>
                  <Kbd.Abbr keyValue="escape" />
                </Kbd>
                dismiss
              </span>
            </Command.Footer>
          </Command.Dialog>
        </Command.Container>
      </Command.Backdrop>
    </Command.Root>
  );
}
