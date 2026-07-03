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
 * Coresignal hiring intelligence — official API only (Tier-3 exclusions are
 * absolute). Endpoint/shape pinned by the 2-week vendor spike (2.3 checklist
 * #2); the adapter is the ONLY place that knows it.
 */
export class CoresignalProvider implements DataProvider {
  readonly key = "coresignal" as const;
  readonly capabilities = ["hiring_data" as const];

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.coresignal.com/cdapi/v2",
  ) {
    if (!apiKey) throw new Error("CoresignalProvider: apiKey is required");
  }

  async fetch(entity: ProviderEntity, window: DateRange): Promise<ProviderFetchResult> {
    if (!entity.domain) return { records: [], unitsUsed: 0 };
    const res = await fetch(`${this.baseUrl}/job_base/search/filter`, {
      method: "POST",
      headers: {
        apikey: this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        company_website: entity.domain,
        created_at_gte: window.from.toISOString().slice(0, 10),
        created_at_lte: window.to.toISOString().slice(0, 10),
        application_active: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`coresignal ${entity.domain}: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as Array<{
      id: number | string;
      title?: string;
      location?: string;
      created_at?: string;
    }>;
    return {
      records: body.map((j) => ({
        id: String(j.id),
        payload: {
          title: j.title ?? "",
          location: j.location ?? null,
          postedAt: j.created_at ?? null,
        },
      })),
      // Coresignal bills per search credit; one filter call = one credit.
      unitsUsed: 1,
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
