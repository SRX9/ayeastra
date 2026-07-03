import { z } from "zod";

/**
 * Evidence discipline, mechanical (ai-platform doc): synthesis tasks receive
 * a FactSheet, cite facts by ref, and the validator — not the prompt — is
 * what makes fabricated citations impossible to persist.
 */

export interface Fact {
  /** Stable per call: "F1", "F2", … */
  ref: string;
  text: string;
  evidenceId: string;
}

export interface FactSheet {
  facts: Fact[];
}

export function buildFactSheet(
  items: Array<{ text: string; evidenceId: string }>,
): FactSheet {
  return {
    facts: items.map((item, i) => ({ ref: `F${i + 1}`, ...item })),
  };
}

/** Prompt block: one "Fn: text" line per fact. */
export function renderFactSheet(sheet: FactSheet): string {
  return sheet.facts.map((f) => `${f.ref}: ${f.text}`).join("\n");
}

/** Reusable output-schema fragment for claim-bearing blocks. */
export const refsSchema = z.array(z.string()).min(1);

/**
 * Post-generation gate, plugged into defineTask's `validate`. Returns
 * repair-loop issues; empty array = valid.
 */
export function validateCitations(
  sheet: FactSheet,
  blocks: Array<{ label: string; refs: string[] }>,
): string[] {
  const known = new Set(sheet.facts.map((f) => f.ref));
  const issues: string[] = [];
  for (const block of blocks) {
    if (block.refs.length === 0) {
      issues.push(`${block.label}: material section cites no facts`);
    }
    for (const ref of block.refs) {
      if (!known.has(ref)) {
        issues.push(
          `${block.label}: cites ${ref}, which is not in the FactSheet — cite only provided F-refs or omit the claim`,
        );
      }
    }
  }
  return issues;
}

/** Persistence mapping: refs → evidence_ids (deduped, input order). Throws on unknown refs — call only after validateCitations passed. */
export function refsToEvidenceIds(sheet: FactSheet, refs: string[]): string[] {
  const byRef = new Map(sheet.facts.map((f) => [f.ref, f.evidenceId]));
  const ids: string[] = [];
  for (const ref of refs) {
    const id = byRef.get(ref);
    if (!id) throw new Error(`unknown fact ref: ${ref}`);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
