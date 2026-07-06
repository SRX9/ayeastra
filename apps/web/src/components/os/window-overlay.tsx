"use client";

import { Modal } from "@heroui/react";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";

/**
 * Client shell for intercepted detail routes: the same look as <Window>,
 * floating over the current screen. Esc / backdrop / ✕ go router.back() so
 * the underlying list keeps its scroll and filter state.
 */
export function WindowOverlay({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  return (
    <Modal.Backdrop
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <Modal.Container size="lg" placement="center" scroll="inside" className="max-w-5xl">
        <Modal.Dialog className="overflow-hidden rounded-lg border border-border bg-surface p-0">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          >
            <header className="flex h-10 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => router.back()}
                  className="flex cursor-pointer text-muted hover:text-foreground"
                >
                  <X size={14} />
                </button>
                <h1 className="font-mono text-xs tracking-wide text-foreground">{title}</h1>
              </div>
              {meta && <div className="font-mono text-xs text-muted">{meta}</div>}
            </header>
            <div className="max-h-[75svh] overflow-y-auto p-6">{children}</div>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
