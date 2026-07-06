"use client";

import { useEffect, useState } from "react";

import { CommandPalette } from "./command-palette";
import { Dock } from "./dock";
import { MenuBar, type SystemStatus } from "./menu-bar";

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
    <>
      <MenuBar status={status} onOpenPalette={() => setPaletteOpen(true)} />
      {children}
      <Dock />
      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
