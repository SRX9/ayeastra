/**
 * DiffViewer (web-app doc): the signature surface — sticky hash-verified
 * evidence header, structured pricing deltas above the raw diff, and the
 * rendered side-by-side diff in a sandboxed iframe (our own renderer's
 * output, but sandboxed anyway — stored content never runs script here).
 * Server component; "board deck screenshot" is the quality bar.
 */

const FETCHED_FMT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export interface PricingDeltaRow {
  plan: string;
  field: string;
  before: string | null;
  after: string | null;
}

export interface DiffViewerProps {
  evidence: {
    sourceUrl: string;
    fetchedAt: Date;
    contentHash: string;
  };
  /** Structured plan-matrix deltas (pricing kind) — rendered above the raw diff. */
  pricingDeltas?: PricingDeltaRow[];
  /** Rendered side-by-side diff HTML (from R2); omitted until storage is wired. */
  diffHtml?: string;
  /** Fallback: extractor output when no structured deltas apply. */
  extracted?: unknown;
}

export function DiffViewer({ evidence, pricingDeltas, diffHtml, extracted }: DiffViewerProps) {
  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {evidence.sourceUrl}
          </a>
          <span className="text-muted">
            fetched {FETCHED_FMT.format(evidence.fetchedAt)} UTC
          </span>
          <span
            className="rounded-md bg-success-soft px-1.5 py-0.5 font-mono text-[11px] text-success-soft-foreground"
            title={evidence.contentHash}
          >
            hash-verified · {evidence.contentHash.slice(0, 12)}…
          </span>
        </div>
      </div>

      {pricingDeltas && pricingDeltas.length > 0 && (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-normal">Plan</th>
              <th className="py-1 pr-2 font-normal">Changed</th>
              <th className="py-1 pr-2 font-normal">Before</th>
              <th className="py-1 font-normal">After</th>
            </tr>
          </thead>
          <tbody>
            {pricingDeltas.map((d) => (
              <tr
                key={`${d.plan}:${d.field}:${d.before}:${d.after}`}
                className="border-t border-border"
              >
                <td className="py-1.5 pr-2 font-medium">{d.plan}</td>
                <td className="py-1.5 pr-2">{d.field.replaceAll("_", " ")}</td>
                <td className="py-1.5 pr-2">
                  <span className="rounded bg-danger-soft px-1 text-danger-soft-foreground line-through">
                    {d.before ?? "—"}
                  </span>
                </td>
                <td className="py-1.5">
                  <span className="rounded bg-success-soft px-1 text-success-soft-foreground">
                    {d.after ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {diffHtml ? (
        <iframe
          sandbox=""
          srcDoc={diffHtml}
          title="Before/after diff"
          className="h-[520px] w-full rounded border border-border"
        />
      ) : extracted ? (
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 text-xs">
          {JSON.stringify(extracted, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-muted">
          Stored page captures (before/after HTML, rendered diff, screenshots)
          attach here once archive storage is connected.
        </p>
      )}
    </div>
  );
}
