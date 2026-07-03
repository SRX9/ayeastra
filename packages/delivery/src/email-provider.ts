/**
 * EmailProvider seam (alerts doc) — mirror of collection's FetchProvider.
 * Cloudflare Email Service is the Phase-1 implementation; Resend/Postmark
 * slot in behind it if inbox placement disappoints. Watch bounce rates.
 */

export interface OutboundEmail {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  providerMessageId: string | null;
}

export interface EmailProvider {
  send(email: OutboundEmail): Promise<SendResult>;
}

/** Cloudflare Email Service over REST (delivery.send runs on Trigger.dev —
 * plain HTTP, no CF SDK; the binding path is only for CF-side senders). */
export class CloudflareEmailProvider implements EmailProvider {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
  ) {
    if (!accountId || !apiToken) {
      throw new Error("CloudflareEmailProvider: accountId and apiToken required");
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: email.to,
          from: email.from,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`cloudflare email send failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { result?: { id?: string } };
    return { providerMessageId: body.result?.id ?? null };
  }
}
