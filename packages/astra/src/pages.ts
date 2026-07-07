/**
 * Pathname → one-line screen description, so Astra knows what the user is
 * looking at. Deliberately coarse (first path segment): detail pages share
 * their list page's hint. Descriptions mirror the KB's user-facing voice.
 */

const HINTS: Record<string, string> = {
  dashboard:
    "the Feed — the live stream of scored signals from every watched company",
  entities: "Entities — the companies being watched and their change history",
  briefings: "Briefings — generated weekly/baseline intelligence documents",
  missions:
    "Missions — standing goals that filter the whole engine through their lens",
  reports: "Reports — saved documents composed from signals and briefings",
  board: "Board Mode — the print-optimized board pack view",
  ask: "Ask — the full-screen Astra conversation view",
  admin: "Admin — internal operations dashboard",
  settings:
    "Settings — business context, modules, billing, and team management",
};

export function pageHint(pathname: string | undefined): string | null {
  if (!pathname) return null;
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const hint = HINTS[segment];
  return hint ? `The user is currently on ${hint}.` : null;
}
