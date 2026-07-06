import type { BlobStore, FetchProvider } from "@ayeastra/collection";

import type { EmbedMessage } from "../seam";

/**
 * Platform ports for the global-observation jobs. The CF worker configures
 * these from its bindings (R2, Queues) + secrets (Firecrawl) at startup;
 * tests configure fakes. Job defs stay platform-neutral — no CF types here.
 */

export interface FetchQueueMessage {
  sourceId: string;
  /** hourBucket() at enqueue time — the fetch idempotency unit. */
  bucket: string;
}

export interface DetectQueueMessage {
  sourceId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
}

export interface ObservePorts {
  blobs: BlobStore;
  provider: FetchProvider;
  enqueueFetch(messages: FetchQueueMessage[]): Promise<void>;
  enqueueDetect(message: DetectQueueMessage): Promise<void>;
  enqueueEmbed(message: EmbedMessage): Promise<void>;
}

let _ports: ObservePorts | undefined;

export function configureObservePorts(ports: ObservePorts): void {
  _ports = ports;
}

export function observePorts(): ObservePorts {
  if (!_ports) {
    throw new Error(
      "observe ports not configured — the job host must call configureObservePorts() at startup",
    );
  }
  return _ports;
}
