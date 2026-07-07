import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";

import { buildAmbient, buildToolset, type AstraContext, type AstraSource } from "./registry";

const noop = () =>
  tool({
    description: "noop",
    inputSchema: z.object({}),
    execute: async () => ({}),
  });

const ctx = { orgName: "TestCo", userId: "user_1", runCtx: {} } as AstraContext;

function source(key: string, toolNames: string[], ambient?: string | null): AstraSource {
  return {
    key,
    title: key,
    description: `${key} desc`,
    tools: () => Object.fromEntries(toolNames.map((n) => [n, noop()])),
    ...(ambient !== undefined
      ? { systemContext: async () => ambient }
      : {}),
  };
}

describe("astra source registry", () => {
  test("merges tools across sources and builds the inventory", () => {
    const { tools, sourceInventory } = buildToolset(
      [source("alpha", ["a_one", "a_two"]), source("beta", ["b_one"])],
      ctx,
    );
    expect(Object.keys(tools).sort()).toEqual(["a_one", "a_two", "b_one"]);
    expect(sourceInventory).toContain("- alpha: alpha desc");
    expect(sourceInventory).toContain("- beta: beta desc");
  });

  test("throws on duplicate tool names — plug-and-play must fail loud", () => {
    expect(() =>
      buildToolset([source("alpha", ["shared"]), source("beta", ["shared"])], ctx),
    ).toThrow('duplicate tool name "shared"');
  });

  test("ambient collects one-liners and skips failures", async () => {
    const failing: AstraSource = {
      ...source("broken", []),
      systemContext: async () => {
        throw new Error("boom");
      },
    };
    const lines = await buildAmbient(
      [source("alpha", [], "TestCo builds testware."), failing, source("quiet", [], null)],
      ctx,
    );
    expect(lines).toEqual(["TestCo builds testware."]);
  });
});
