import Link from "next/link";

import type { Severity } from "@/lib/intel";

/** The shared visual vocabulary (web-app doc): severity, confidence,
 * evidence, priority tags. Server components — zero client JS. */

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-danger text-danger-foreground",
  high: "bg-warning text-warning-foreground",
  notable: "bg-accent-soft text-accent-soft-foreground",
  info: "bg-default text-muted",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className="inline-block rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">
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
          className="rounded-md bg-default px-1.5 py-0.5 font-mono text-[11px] text-muted no-underline hover:text-foreground"
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
          className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent-soft-foreground"
        >
          {a.segment ? `segment: ${a.segment}` : `priority: ${a.priorityId}`}
        </span>
      ))}
    </span>
  );
}
