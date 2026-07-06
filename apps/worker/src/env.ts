import type {
  DurableObjectNamespace,
  Hyperdrive,
  Queue,
  R2Bucket,
  Workflow,
} from "@cloudflare/workers-types";

import {
  FirecrawlProvider,
  type BlobStore,
  type FetchProvider,
} from "@ayeastra/collection";
import {
  configureDiscoveryStarter,
  configureEmbedPublisher,
  configureObservePorts,
} from "@ayeastra/pipeline";

export interface Env {
  FETCH_QUEUE: Queue;
  DETECT_QUEUE: Queue;
  EMBED_QUEUE: Queue;
  SNAPSHOTS: R2Bucket;
  HYPERDRIVE: Hyperdrive;
  DOMAIN_SEMAPHORE: DurableObjectNamespace;
  SOURCE_DISCOVER: Workflow;
  FIRECRAWL_API_KEY: string;
}

/** R2 behind the platform-neutral BlobStore seam (collection doc). */
function r2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async put(key, value, contentType) {
      await bucket.put(key, value, { httpMetadata: { contentType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    },
  };
}

let bootstrapped = false;

/**
 * Per-invocation bootstrap: point packages/db at Hyperdrive and wire the
 * pipeline's observe ports to real bindings. Secrets/vars already live in
 * process.env (nodejs_compat populates it); the Hyperdrive URL is the one
 * binding that must be copied by hand.
 */
export function bootstrap(env: Env): void {
  process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  if (bootstrapped) return;
  bootstrapped = true;

  // Lazy so a missing Firecrawl key breaks fetches loudly (→ DLQ + failure
  // ladder) without also breaking detect/embed consumers in the same isolate.
  let provider: FetchProvider | undefined;
  configureObservePorts({
    blobs: r2BlobStore(env.SNAPSHOTS),
    get provider(): FetchProvider {
      provider ??= new FirecrawlProvider(env.FIRECRAWL_API_KEY);
      return provider;
    },
    async enqueueFetch(messages) {
      // sendBatch caps at 100 messages per call.
      for (let i = 0; i < messages.length; i += 100) {
        await env.FETCH_QUEUE.sendBatch(
          messages.slice(i, i + 100).map((body) => ({ body })),
        );
      }
    },
    async enqueueDetect(message) {
      await env.DETECT_QUEUE.send(message);
    },
    async enqueueEmbed(message) {
      await env.EMBED_QUEUE.send(message);
    },
  });
  configureEmbedPublisher(async (msg) => {
    await env.EMBED_QUEUE.send(msg);
  });
  configureDiscoveryStarter(async (entityId) => {
    await env.SOURCE_DISCOVER.create({ params: { entityId } });
  });
}
