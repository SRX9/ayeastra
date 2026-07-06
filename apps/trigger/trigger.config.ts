import { defineConfig } from "@trigger.dev/sdk";

/**
 * The per-org intelligence host (jobs doc §The split). Set
 * TRIGGER_PROJECT_REF after `npx trigger.dev@latest init` links the cloud
 * project; TRIGGER_SECRET_KEY authenticates deploys and the REST seam.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./src/trigger"],
  maxDuration: 600, // convention #5: >10 min must decompose into child tasks
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 15_000,
      maxTimeoutInMs: 900_000,
      randomize: true,
    },
  },
});
