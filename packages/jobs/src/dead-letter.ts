import { getDb, jobDeadLetters } from "@ayeastra/db";

/**
 * Convention #3: exhausted retries land here and fire an internal ops alert.
 * Dead letters are reviewed, not ignored — the internal page lists
 * unresolved rows.
 */
export async function writeDeadLetter(
  jobName: string,
  payload: unknown,
  error: string,
): Promise<void> {
  await getDb()
    .insert(jobDeadLetters)
    .values({ jobName, payload: payload ?? {}, error });

  const webhook = process.env.OPS_ALERT_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `☠️ dead letter: ${jobName} — ${error.slice(0, 500)}`,
        }),
      });
    } catch (err) {
      console.error("dead-letter ops alert failed", err);
    }
  }
}
