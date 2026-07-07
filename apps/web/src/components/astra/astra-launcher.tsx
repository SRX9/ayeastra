"use client";

import { Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";

import { useAstra } from "./use-astra";

/** The floating Astra button — bottom-right sibling of the dock. Hidden on
 * /ask (that page IS the assistant) and in print/board output. */

export function AstraLauncher() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const { open, setOpen } = useAstra();

  if (pathname.startsWith("/ask")) return null;

  return (
    <motion.button
      type="button"
      aria-label={open ? "Close Astra" : "Ask Astra"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      whileHover={reducedMotion ? undefined : { scale: 1.12, y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`os-chrome fixed bottom-4 right-5 z-40 flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-surface/80 px-3 py-2.5 backdrop-blur-xl print:hidden ${
        open ? "text-accent" : "text-muted hover:text-foreground"
      }`}
    >
      <Sparkles size={20} strokeWidth={1.75} />
      <span className="font-mono text-xs">Astra</span>
    </motion.button>
  );
}
