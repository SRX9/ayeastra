/**
 * source.discover pure helpers (collection doc): candidate paths, feed
 * detection, news/EDGAR feed URLs. The CF Workflow orchestrates these with
 * fetches + classify-page-kind; these stay testable offline.
 */

/** Common paths probed per domain, with the kind they usually are. */
export const COMMON_PATHS: Record<string, string> = {
  "/pricing": "pricing",
  "/plans": "pricing",
  "/changelog": "changelog",
  "/release-notes": "changelog",
  "/blog": "blog",
  "/careers": "careers",
  "/jobs": "careers",
  "/press": "news",
  "/docs": "docs",
};

export function candidateUrls(domain: string): Array<{ url: string; kindHint: string }> {
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return [
    { url: base, kindHint: "homepage" },
    ...Object.entries(COMMON_PATHS).map(([path, kindHint]) => ({
      url: `${base}${path}`,
      kindHint,
    })),
  ];
}

/** RSS/Atom autodiscovery — feeds are cheaper and more precise than diffs. */
export function detectFeeds(html: string, baseUrl: string): string[] {
  const feeds: string[] = [];
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel=["']?alternate["']?/i.test(tag)) continue;
    if (!/type=["']?application\/(?:rss|atom)\+xml["']?/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      feeds.push(new URL(href, baseUrl).toString());
    } catch {
      // Malformed href — skip, discovery is best-effort.
    }
  }
  return [...new Set(feeds)];
}

/** One news source per entity (discovery step 4). */
export function googleNewsRssUrl(entityName: string, domain: string): string {
  const q = encodeURIComponent(`"${entityName}" OR site:${domain}`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Category watches (2.1): market-type entities' sources are keyword-query
 * feeds rather than site maps. One feed per keyword phrase, deduped —
 * discovery maps these to sources of kind "keyword_feed".
 */
export function keywordFeedUrl(query: string): string {
  const phrase = /\s/.test(query) ? `"${query}"` : query;
  const q = encodeURIComponent(phrase);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

export function marketFeedUrls(
  marketName: string,
  keywords: string[],
): string[] {
  const queries = new Set(
    [marketName, ...keywords].map((k) => k.trim().toLowerCase()).filter(Boolean),
  );
  return [...queries].map((q) => keywordFeedUrl(q));
}

/** SEC EDGAR filings feed for public companies (discovery step 5). */
export function edgarFilingsFeedUrl(cik: string): string {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}&type=8-K&dateb=&owner=include&count=40&output=atom`;
}

/** Sitemap URL extraction (discovery step 1) — regex is enough for <loc>. */
export function urlsFromSitemap(xml: string, limit = 500): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && urls.length < limit) urls.push(m[1]!);
  return urls;
}
