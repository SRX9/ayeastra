import { env } from "@ayeastra/env/server";
import cors from "cors";
import express from "express";

import { requireAuth } from "./auth";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).send("OK");
});

// Example protected route: echoes the verified WorkOS token claims.
app.get("/api/me", requireAuth, (req, res) => {
  const { sub, org_id, role, permissions } = req.auth!;
  res.json({ userId: sub, organizationId: org_id ?? null, role: role ?? null, permissions: permissions ?? [] });
});

app.listen(env.PORT, () => {
  console.log(`Server is running on http://localhost:${env.PORT}`);
});
