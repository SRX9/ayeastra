import { DurableObject } from "cloudflare:workers";

/**
 * Per-domain politeness semaphore (jobs doc convention #4): max 2 concurrent
 * fetches per domain — one DO instance per domain via idFromName(domain).
 * The one hand-rolled piece, accepted for the CF cost win. Leases expire so
 * a crashed consumer never wedges a domain.
 */

const MAX_CONCURRENT = 2;
const LEASE_MS = 120_000;

interface Lease {
  id: string;
  expiresAt: number;
}

export class DomainSemaphore extends DurableObject {
  async acquire(): Promise<{ granted: boolean; leaseId: string | null }> {
    const leases = await this.liveLeases();
    if (leases.length >= MAX_CONCURRENT) {
      return { granted: false, leaseId: null };
    }
    const lease: Lease = { id: crypto.randomUUID(), expiresAt: Date.now() + LEASE_MS };
    await this.ctx.storage.put("leases", [...leases, lease]);
    return { granted: true, leaseId: lease.id };
  }

  async release(leaseId: string): Promise<void> {
    const leases = await this.liveLeases();
    await this.ctx.storage.put(
      "leases",
      leases.filter((l) => l.id !== leaseId),
    );
  }

  private async liveLeases(): Promise<Lease[]> {
    const now = Date.now();
    const leases = ((await this.ctx.storage.get<Lease[]>("leases")) ?? []).filter(
      (l) => l.expiresAt > now,
    );
    return leases;
  }
}

/** Blocking acquire with bounded waits; gives up after ~50s so the queue
 * retry (with backoff) takes over instead of the invocation spinning. */
export async function withDomainLease<T>(
  ns: { idFromName(name: string): { toString(): string } } & DurableObjectNamespaceLike,
  url: string,
  fn: () => Promise<T>,
): Promise<T> {
  const domain = new URL(url).hostname;
  const stub = ns.get(ns.idFromName(domain)) as unknown as DomainSemaphore;
  let leaseId: string | null = null;
  for (let attempt = 0; attempt < 5 && !leaseId; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10_000));
    ({ leaseId } = await stub.acquire());
  }
  if (!leaseId) throw new Error(`politeness semaphore saturated for ${domain}`);
  try {
    return await fn();
  } finally {
    await stub.release(leaseId);
  }
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}
