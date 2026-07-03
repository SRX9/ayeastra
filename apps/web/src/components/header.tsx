"use client";

import { Separator } from "@heroui/react";
import Link from "next/link";

import { ModeToggle } from "./mode-toggle";
import { UserMenu } from "./user-menu";

export default function Header() {
  const links = [
    { to: "/dashboard", label: "Feed" },
    { to: "/entities", label: "Entities" },
    { to: "/briefings", label: "Briefings" },
    { to: "/ask", label: "Ask" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} href={to} className="link">
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <Separator />
    </div>
  );
}
