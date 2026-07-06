/**
 * @ayeastra/pipeline — the job layer that connects the engines (remaining.md
 * §1). Global-observation jobs run on the CF worker host (apps/worker);
 * per-org intelligence jobs run on Trigger.dev (apps/trigger). All defs ride
 * the vendor-free @ayeastra/jobs contract; the seam module is the only place
 * cross-platform traffic is encoded.
 */

// Global observation (Cloudflare hosts these)
export { schedulerTick } from "./observe/scheduler-tick";
export { sourceFetch } from "./observe/source-fetch";
export { changeDetect } from "./observe/change-detect";
export { embedUpsert } from "./observe/embed-upsert";
export {
  configureObservePorts,
  observePorts,
  type DetectQueueMessage,
  type FetchQueueMessage,
  type ObservePorts,
} from "./observe/ports";

// Per-org intelligence (Trigger.dev hosts these)
export { changeAnalyze } from "./intel/change-analyze";
export { signalGround } from "./intel/signal-ground";
export { signalRoute } from "./intel/signal-route";
export { digestDaily } from "./intel/digest-daily";
export { briefingWeekly, briefingBaseline } from "./intel/briefing-jobs";
export { battlecardRefresh } from "./intel/battlecard-refresh";
export { deliverySend } from "./intel/delivery-send";
export { contextEnrich } from "./intel/context-enrich";

// The seam
export {
  configureDiscoveryStarter,
  configureEmbedPublisher,
  publishEmbed,
  startDiscovery,
  triggerTask,
  type EmbedMessage,
  type TriggerOptions,
} from "./seam";
