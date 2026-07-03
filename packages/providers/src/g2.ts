import type {
  DataProvider,
  DateRange,
  ProviderEntity,
  ProviderFetchResult,
  ProviderRecord,
} from "./provider";

/**
 * G2 review intelligence — official partnership/API ONLY (2.3: the
 * partnership is a business dependency pursued in parallel; this adapter is
 * inert until G2_API_KEY exists). Review velocity, rating trend, switching
 * mentions — voice-of-customer citations for battlecards.
 */
export class G2Provider implements DataProvider {
  readonly key = "g2" as const;
  readonly capabilities = ["review_data" as const];

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://data.g2.com/api/v1",
  ) {
    if (!apiKey) throw new Error("G2Provider: apiKey is required");
  }

  async fetch(entity: ProviderEntity, window: DateRange): Promise<ProviderFetchResult> {
    const params = new URLSearchParams({
      "filter[product_name]": entity.canonicalName,
      "filter[updated_at_gte]": window.from.toISOString(),
      "filter[updated_at_lte]": window.to.toISOString(),
      "page[size]": "100",
    });
    const res = await fetch(`${this.baseUrl}/survey-responses?${params}`, {
      headers: {
        authorization: `Token token=${this.apiKey}`,
        "content-type": "application/vnd.api+json",
      },
    });
    if (!res.ok) {
      throw new Error(`g2 ${entity.canonicalName}: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: Array<{
        id: string;
        attributes?: {
          star_rating?: number;
          title?: string;
          submitted_at?: string;
          comment_answers?: Record<string, { value?: string }>;
        };
      }>;
    };
    const reviews = body.data ?? [];
    return {
      records: reviews.map((r) => ({
        id: r.id,
        payload: {
          rating: r.attributes?.star_rating ?? null,
          title: r.attributes?.title ?? "",
          submittedAt: r.attributes?.submitted_at ?? null,
          likes: r.attributes?.comment_answers?.love?.value ?? null,
          dislikes: r.attributes?.comment_answers?.hate?.value ?? null,
        },
      })),
      unitsUsed: reviews.length,
    };
  }

  normalize(records: ProviderRecord[]): Record<string, unknown> {
    const ratings = records
      .map((r) => r.payload.rating)
      .filter((n): n is number => typeof n === "number");
    return {
      kind: "reviews",
      reviewCount: records.length,
      avgRating:
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
          : null,
      ratingCounts: ratings.reduce<Record<string, number>>((acc, r) => {
        acc[String(r)] = (acc[String(r)] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  describe(record: ProviderRecord): string {
    const rating = record.payload.rating;
    const title = String(record.payload.title ?? "").slice(0, 120);
    return `G2 review${typeof rating === "number" ? ` (${rating}★)` : ""}: ${title}`;
  }
}
