"use client";

import { Maximize2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAstraSuggestions } from "./actions";
import { AstraChat } from "./astra-chat";
import { useAstra } from "./use-astra";

/**
 * Anchored chat panel (Intercom-style), deliberately not a Modal: the page
 * stays usable underneath, no focus trap, Esc closes. Sits above the
 * launcher, clear of the centered dock.
 */

export function AstraPanel() {
  const { open, setOpen } = useAstra();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [threadId, setThreadId] = useState<string>();
  // Remount the chat (fresh thread) after handing the conversation off to
  // /ask; within one open/close cycle state persists.
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && suggestions.length === 0) {
      getAstraSuggestions().then(setSuggestions).catch(() => {});
    }
  }, [open, suggestions.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key={sessionKey}
          role="complementary"
          aria-label="Astra assistant"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="os-chrome fixed bottom-19 right-5 z-40 flex h-[min(600px,70vh)] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-none backdrop-blur-xl print:hidden"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <span className="font-mono text-xs text-foreground">Astra</span>
            <span className="font-mono text-[10px] text-muted">
              intelligence copilot
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Open full screen"
                onClick={() => {
                  setOpen(false);
                  setSessionKey((k) => k + 1);
                  setThreadId(undefined);
                  router.push(threadId ? `/ask?thread=${threadId}` : "/ask");
                }}
                className="cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:text-foreground"
              >
                <Maximize2 size={13} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label="Close Astra"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:text-foreground"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          </header>
          <AstraChat
            variant="panel"
            suggestions={suggestions}
            onThreadChange={setThreadId}
          />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
