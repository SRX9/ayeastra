/**
 * Buy-don't-build seam (collection doc): Firecrawl is the only Phase-1
 * implementation; Zyte/Browserless slot in behind the same interface for
 * hard targets without touching callers. Plain fetch — workerd-portable.
 */

export interface FetchResult {
  html: string;
  markdown: string;
  /** PNG bytes; requested only for pricing pages (cost control). */
  screenshot?: Uint8Array;
  httpStatus: number;
  /** Provider billing units for cost_events (estimate flagged in meta). */
  creditsUsed: number;
}

export interface FetchProvider {
  scrape(url: string, opts: { screenshot: boolean }): Promise<FetchResult>;
}

export class FirecrawlProvider implements FetchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.firecrawl.dev",
  ) {
    if (!apiKey) throw new Error("FirecrawlProvider: apiKey is required");
  }

  async scrape(url: string, opts: { screenshot: boolean }): Promise<FetchResult> {
    const formats: unknown[] = ["markdown", "rawHtml"];
    if (opts.screenshot) formats.push({ type: "screenshot", fullPage: true });

    const res = await fetch(`${this.baseUrl}/v2/scrape`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url, formats }),
    });
    if (!res.ok) {
      throw new Error(`firecrawl scrape ${url}: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      success: boolean;
      error?: string;
      data?: {
        markdown?: string;
        rawHtml?: string;
        screenshot?: string;
        metadata?: { statusCode?: number };
      };
    };
    if (!body.success || !body.data) {
      throw new Error(`firecrawl scrape ${url}: ${body.error ?? "no data"}`);
    }

    let screenshot: Uint8Array | undefined;
    if (opts.screenshot && body.data.screenshot) {
      screenshot = await downloadScreenshot(body.data.screenshot);
    }

    return {
      html: body.data.rawHtml ?? "",
      markdown: body.data.markdown ?? "",
      screenshot,
      httpStatus: body.data.metadata?.statusCode ?? 200,
      creditsUsed: opts.screenshot ? 2 : 1,
    };
  }
}

async function downloadScreenshot(ref: string): Promise<Uint8Array | undefined> {
  if (ref.startsWith("data:")) {
    const b64 = ref.slice(ref.indexOf(",") + 1);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  const res = await fetch(ref);
  if (!res.ok) return undefined; // screenshot is best-effort evidence
  return new Uint8Array(await res.arrayBuffer());
}
