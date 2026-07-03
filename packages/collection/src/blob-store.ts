/**
 * Snapshot blob storage. The CF worker implements this over its R2 binding;
 * tests use the in-memory implementation. Keys follow the collection doc:
 * snapshots/{sourceId}/{fetchedAtISO}-{contentHash8}.{html|md|png}
 */

export interface BlobStore {
  put(key: string, value: string | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export function snapshotKeys(sourceId: string, fetchedAt: Date, hash: string) {
  const stamp = fetchedAt.toISOString().replace(/[:.]/g, "-");
  const base = `snapshots/${sourceId}/${stamp}-${hash.slice(0, 8)}`;
  return { html: `${base}.html`, md: `${base}.md`, png: `${base}.png` };
}

export class InMemoryBlobStore implements BlobStore {
  readonly blobs = new Map<string, Uint8Array>();

  async put(key: string, value: string | Uint8Array): Promise<void> {
    this.blobs.set(
      key,
      typeof value === "string" ? new TextEncoder().encode(value) : value,
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key) ?? null;
  }
}
