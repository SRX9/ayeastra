export type {
  BriefingSectionDef,
  ContextSliceDef,
  ModuleKey,
  ModuleManifest,
  OnboardingQuestionDef,
  SignalCategory,
  SourceKind,
} from "./manifest";
export {
  MODULE_REGISTRY,
  moduleForSignal,
  sectionDefsForModules,
  TOTAL_THEMED_BUDGET,
} from "./registry";
export {
  activeModuleKeys,
  isModuleActive,
  moduleFromLookupKey,
  moduleLookupKeys,
  type OrgModuleRow,
} from "./entitlements";
