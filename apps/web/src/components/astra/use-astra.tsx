"use client";

import { createContext, useContext, useMemo, useState } from "react";

/** Panel open/close state, exposed via context so other chrome (command
 * palette, menu bar) can summon Astra without prop drilling. */

interface AstraState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AstraCtx = createContext<AstraState | null>(null);

export function AstraProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <AstraCtx.Provider value={value}>{children}</AstraCtx.Provider>;
}

export function useAstra(): AstraState {
  const ctx = useContext(AstraCtx);
  if (!ctx) throw new Error("useAstra must be used inside <AstraProvider>");
  return ctx;
}
