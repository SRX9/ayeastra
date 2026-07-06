import { toTriggerTask } from "@ayeastra/jobs/trigger";
import {
  battlecardRefresh,
  briefingBaseline,
  briefingWeekly,
  changeAnalyze,
  contextEnrich,
  deliverySend,
  digestDaily,
  signalGround,
  signalRoute,
} from "@ayeastra/pipeline";
import {
  fusionBacktest,
  fusionObserve,
  fusionScan,
} from "@ayeastra/fusion/jobs";
import {
  boardAssembleJob,
  missionBriefJob,
  missionRetroJob,
} from "@ayeastra/workflow/jobs";

/**
 * Every per-org job registered through the shared adapter (jobs doc:
 * idempotency, retries, dead-letter writer ride toTriggerTask). Task ids are
 * the job names — the REST seam addresses them by these strings.
 */

// Pipeline (Phase 1 — the spine)
export const changeAnalyzeTask = toTriggerTask(changeAnalyze);
export const signalGroundTask = toTriggerTask(signalGround);
export const signalRouteTask = toTriggerTask(signalRoute);
export const digestDailyTask = toTriggerTask(digestDaily);
export const briefingWeeklyTask = toTriggerTask(briefingWeekly);
export const briefingBaselineTask = toTriggerTask(briefingBaseline);
export const battlecardRefreshTask = toTriggerTask(battlecardRefresh);
export const deliverySendTask = toTriggerTask(deliverySend);
export const contextEnrichTask = toTriggerTask(contextEnrich);

// Fusion engine (Phase 3.1)
export const fusionObserveTask = toTriggerTask(fusionObserve);
export const fusionScanTask = toTriggerTask(fusionScan);
export const fusionBacktestTask = toTriggerTask(fusionBacktest);

// Workflow layer (Phase 3.2)
export const missionBriefTask = toTriggerTask(missionBriefJob);
export const missionRetroTask = toTriggerTask(missionRetroJob);
export const boardAssembleTask = toTriggerTask(boardAssembleJob);
