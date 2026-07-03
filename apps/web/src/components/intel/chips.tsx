import Link from "next/link";

import type { Severity } from "@/lib/intel";

/** The shared visual vocabulary (web-app doc): severity, confidence,
 * evidence, priority tags. Server components — zero client JS. */

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  notable: "bg-amber-200 text-amber-950 dark:bg-amber-300",
  info: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className="inline-block rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-muted dark:border-neutral-600">
      {confidence} confidence
    </span>
  );
}

export function EvidenceChips({ evidenceIds }: { evidenceIds: string[] }) {
  if (evidenceIds.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {evidenceIds.map((id, i) => (
        <Link
          key={id}
          href={`/evidence/${id}`}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          evidence {i + 1}
        </Link>
      ))}
    </span>
  );
}

export interface PriorityAttachment {
  priorityId?: string;
  segment?: string | null;
  positioningRisk?: string | null;
}

export function PriorityTags({ attachments }: { attachments: unknown }) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;
  const items = attachments as PriorityAttachment[];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((a, i) => (
        <span
          key={i}
          className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 dark:bg-blue-950 dark:text-blue-200"
        >
          {a.segment ? `segment: ${a.segment}` : `priority: ${a.priorityId}`}
        </span>
      ))}
    </span>
  );
}
