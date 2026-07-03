import {
  describePosting,
  normalizeHiring,
  type JobPosting,
} from "./hiring";
import type {
  DataProvider,
  DateRange,
  ProviderEntity,
  ProviderFetchResult,
  ProviderRecord,
} from "./provider";

/**
 * TheirStack hiring intelligence — the spike's second hiring vendor. Emits
 * the exact same extracted_facts as Coresignal (shared normalizeHiring), so
 * whichever wins on coverage/freshness/cost swaps in without callers moving.
 */
export class TheirStackProvider implements DataProvider {
  readonly key = "theirstack" as const;
  readonly capabilities = ["hiring_data" as const];

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.theirstack.com/v1",
  ) {
    if (!apiKey) throw new Error("TheirStackProvider: apiKey is required");
  }

  async fetch(entity: ProviderEntity, window: DateRange): Promise<ProviderFetchResult> {
    if (!entity.domain) return { records: [], unitsUsed: 0 };
    const res = await fetch(`${this.baseUrl}/jobs/search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        company_domain_or: [entity.domain],
        posted_at_gte: window.from.toISOString().slice(0, 10),
        posted_at_lte: window.to.toISOString().slice(0, 10),
        limit: 100,
      }),
    });
    if (!res.ok) {
      throw new Error(`theirstack ${entity.domain}: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: Array<{
        id: number | string;
        job_title?: string;
        location?: string;
        date_posted?: string;
      }>;
    };
    const jobs = body.data ?? [];
    return {
      records: jobs.map((j) => ({
        id: String(j.id),
        payload: {
          title: j.job_title ?? "",
          location: j.location ?? null,
          postedAt: j.date_posted ?? null,
        },
      })),
      // TheirStack bills per returned job row.
      unitsUsed: jobs.length,
    };
  }

  normalize(records: ProviderRecord[]): Record<string, unknown> {
    return normalizeHiring(records, posting);
  }

  describe(record: ProviderRecord): string {
    return describePosting(posting(record));
  }
}

function posting(r: ProviderRecord): JobPosting {
  return {
    title: String(r.payload.title ?? ""),
    location: (r.payload.location as string | null) ?? null,
    postedAt: (r.payload.postedAt as string | null) ?? null,
  };
}
