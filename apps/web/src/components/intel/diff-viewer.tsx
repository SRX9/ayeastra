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
      <div className="sticky top-0 z-10 mb-4 rounded border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
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
            className="rounded bg-green-100 px-1.5 py-0.5 font-mono text-[11px] text-green-800 dark:bg-green-950 dark:text-green-300"
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
                className="border-t border-neutral-200 dark:border-neutral-700"
              >
                <td className="py-1.5 pr-2 font-medium">{d.plan}</td>
                <td className="py-1.5 pr-2">{d.field.replaceAll("_", " ")}</td>
                <td className="py-1.5 pr-2">
                  <span className="rounded bg-red-50 px-1 text-red-800 line-through dark:bg-red-950 dark:text-red-300">
                    {d.before ?? "—"}
                  </span>
                </td>
                <td className="py-1.5">
                  <span className="rounded bg-green-50 px-1 text-green-800 dark:bg-green-950 dark:text-green-300">
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
          className="h-[520px] w-full rounded border border-neutral-200 dark:border-neutral-700"
        />
      ) : extracted ? (
        <pre className="overflow-x-auto rounded border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-700 dark:bg-neutral-900">
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
