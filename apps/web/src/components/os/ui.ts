/** Shared class vocabulary for the OS re-skin — server-component-safe
 * (plain strings, no JS), so form-post pages keep zero client weight. */

export const osButton =
  "cursor-pointer rounded-md border border-border bg-transparent px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:border-border-secondary hover:text-foreground";

export const osButtonPrimary =
  "cursor-pointer rounded-md bg-accent px-3 py-1.5 font-mono text-xs text-accent-foreground transition-colors hover:bg-accent-hover";

export const osInput =
  "rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

export const osSelect =
  "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none";

/** Hairline module on the canvas — the non-window sibling of <Window>. */
export const osModule = "rounded-lg border border-border bg-surface";
