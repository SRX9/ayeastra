export {
  defineJob,
  backoffSeconds,
  hourBucket,
  JOB_DEFAULTS,
  type JobContext,
  type JobDef,
} from "./contract";
export { writeDeadLetter } from "./dead-letter";
// Adapters are platform-specific entry points — import from
// "@ayeastra/jobs/cf" or "@ayeastra/jobs/trigger", never from here.
