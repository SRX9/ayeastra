import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    WORKOS_CLIENT_ID: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Phase 2.2 — outcome-loop close endpoints (credential-gated: routes
    // respond 501 until the secrets exist).
    ACTION_CLOSE_SECRET: z.string().min(32).optional(),
    SLACK_SIGNING_SECRET: z.string().min(1).optional(),
    // Phase 2.3 — paid data providers (activated per the economics gate).
    CORESIGNAL_API_KEY: z.string().min(1).optional(),
    THEIRSTACK_API_KEY: z.string().min(1).optional(),
    G2_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
