/**
 * Stage 1 (diff doc): split normalized markdown into stable blocks —
 * headings, paragraphs, table rows, list items — the units the patience
 * diff compares and the renderer displays.
 */
export function splitBlocks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let inFence = false;
  let fence: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push(paragraph.join("\n"));
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inFence) {
        fence.push(line);
        blocks.push(fence.join("\n"));
        fence = [];
        inFence = false;
      } else {
        flush();
        inFence = true;
        fence = [line];
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
    } else if (/^#{1,6}\s/.test(trimmed)) {
      flush();
      blocks.push(trimmed);
    } else if (/^\|/.test(trimmed)) {
      // Each table row is its own block so a single price cell change
      // isolates to one row; separator rows (|---|) are structural noise.
      flush();
      if (!/^\|[\s\-:|]+\|?$/.test(trimmed)) blocks.push(trimmed);
    } else if (/^(?:[-*+]|\d+[.)])\s/.test(trimmed)) {
      flush();
      blocks.push(trimmed);
    } else if (
      /^\s{2,}/.test(line) &&
      blocks.length > 0 &&
      paragraph.length === 0 &&
      /^(?:[-*+]|\d+[.)])\s/.test(blocks[blocks.length - 1]!.trimStart())
    ) {
      // Continuation of a list item.
      blocks[blocks.length - 1] += `\n${trimmed}`;
    } else {
      paragraph.push(trimmed);
    }
  }
  if (inFence && fence.length) blocks.push(fence.join("\n"));
  flush();
  return blocks;
}
