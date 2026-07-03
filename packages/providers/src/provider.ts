/**
 * Paid data sources behind ONE interface (2.3): a provider is just another
 * fact producer. Its output enters the pipeline as changes rows
 * (source.kind: hiring_data | review_data) with extracted_facts — grounding,
 * scoring, briefings, Ask all work unchanged. Tier-3 exclusions (LinkedIn
 * scraping, ToS-hostile collection) are absolute: only official APIs.
 */

export type ProviderKey = "coresignal" | "theirstack" | "g2";
export type ProviderSourceKind = "hiring_data" | "review_data";

export interface ProviderEntity {
  id: string;
  canonicalName: string;
  domain: string | null;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/** One provider record — `id` + retrieval timestamp IS the evidence
 * (provider name + record ID + retrieval timestamp, doc §interface). */
export interface ProviderRecord {
  id: string;
  payload: Record<string, unknown>;
}

export interface ProviderFetchResult {
  records: ProviderRecord[];
  /** Vendor billing units consumed, for cost_events (law #6). */
  unitsUsed: number;
}

export interface DataProvider {
  key: ProviderKey;
  capabilities: ProviderSourceKind[];
  fetch(entity: ProviderEntity, window: DateRange): Promise<ProviderFetchResult>;
  /** → same shape the diff engine emits into changes.extracted_facts. */
  normalize(records: ProviderRecord[]): Record<string, unknown>;
  /** One-line rendering of a record, for classify-change blocks. */
  describe(record: ProviderRecord): string;
}
