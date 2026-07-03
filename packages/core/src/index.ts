export {
  BusinessContext,
  BusinessContextDraft,
  CompanySlice,
  CompetitorSlice,
  ConcernSlice,
  DeliverySlice,
  MarketWatchSlice,
  PositioningSlice,
  PrioritySlice,
  SegmentSlice,
} from "./business-context";
export {
  appendContextVersion,
  currentContext,
  type ContextVersion,
} from "./context-store";
export {
  INTERVIEW_STAGES,
  mergeSlice,
  missingForActivation,
  nextStage,
  type InterviewStage,
} from "./interview";
export { resolveEntity } from "./resolve-entity";
