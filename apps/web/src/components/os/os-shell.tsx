"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { AstraProvider } from "@/components/astra/use-astra";

import { CommandPalette } from "./command-palette";
import { Dock } from "./dock";
import { MenuBar, type SystemStatus } from "./menu-bar";

// Lazy: the chat bundle (AI SDK + markdown renderer) shouldn't tax pages
// where Astra stays closed.
const AstraLauncher = dynamic(
  () => import("@/components/astra/astra-launcher").then((m) => m.AstraLauncher),
  { ssr: false },
);
const AstraPanel = dynamic(
  () => import("@/components/astra/astra-panel").then((m) => m.AstraPanel),
  { ssr: false },
);

export function OsShell({
  status,
  children,
}: {
  status: SystemStatus | null;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AstraProvider>
      <MenuBar status={status} onOpenPalette={() => setPaletteOpen(true)} />
      {children}
      <Dock />
      <AstraLauncher />
      <AstraPanel />
      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </AstraProvider>
  );
}
