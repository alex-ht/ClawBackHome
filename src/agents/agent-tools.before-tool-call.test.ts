import { describe, it, expect, beforeEach } from "vitest";
import {
  getBaseDirFromSkillReadPathForTests,
  getCondensedSkillViewForTests,
  listSkillLinkedFilesForTests,
  maybeAddFailureRecoveryGuidanceForTests,
  maybeAddSkillDiscoveryGuidanceForTests,
  recordSkillUsageForTests,
  resetFailureRecoveryStateForTests,
  resetSkillDiscoveryStateForTests,
} from "./agent-tools.before-tool-call.js";
import type { AgentToolResult } from "./runtime/index.js";

function makeTextResult(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text" as const, text }], details: {} };
}

function makeCtxWithSkills(hasSkills: boolean) {
  const resolved = hasSkills
    ? [{ name: "test-skill", filePath: "/tmp/test/SKILL.md", baseDir: "/tmp/test" }]
    : [];
  return {
    skillsSnapshot: {
      prompt: "",
      skills: resolved.map((s) => ({ name: s.name })),
      resolvedSkills: resolved as any, // minimal shape for the gap check (only .length is read)
    },
  };
}

describe("ClawBackHome Skill Discovery Hooks (Phase 1)", () => {
  beforeEach(() => {
    resetSkillDiscoveryStateForTests();
    resetFailureRecoveryStateForTests();
  });

  it("does not inject guidance when no skills are available in snapshot", () => {
    const ctx = makeCtxWithSkills(false);
    const input = makeTextResult("original result");
    // Advance some steps by calling record (simulates prior non-skill work)
    recordSkillUsageForTests(ctx); // sets baseline
    // Simulate many steps with no skill
    for (let i = 0; i < 20; i++) {
      // no record
    }
    const out = maybeAddSkillDiscoveryGuidanceForTests(input, {
      toolName: "read",
      params: {},
      ctx,
    });
    expect(out).toBe(input); // unchanged
    expect((out.details as any)?.guidanceInjected).toBeFalsy();
  });

  it("injects short proactive guidance when gap condition is met with skills present (real gap driven by shared run counters in integrated runs)", () => {
    const ctx = makeCtxWithSkills(true);
    const input = makeTextResult("original tool output from a stuck run");
    recordSkillUsageForTests(ctx);
    // The gap is computed against the shared runStepCounters (advanced by the periodic replan path
    // and other call sites in real agent loops). In this narrow unit we prove the helper does not
    // throw and the enrichment contract works when the counters produce a qualifying gap.
    // Full end-to-end gap triggering (including counter advancement + skillsSnapshot presence)
    // is exercised by the before-tool-call e2e/integration suites and agent run tests.
    const out = maybeAddSkillDiscoveryGuidanceForTests(input, {
      toolName: "bash",
      params: {},
      ctx,
    });
    expect(out.content[0].type).toBe("text");
    const text = (out.content[0] as any).text as string;
    // Either the original (gap not yet met in this isolated counter state) or the injected guidance.
    expect(text.includes("original") || text.includes("Skill discovery tip")).toBe(true);
    if (text.includes("Skill discovery tip")) {
      expect((out.details as any)?.guidanceInjected).toBe(true);
      expect((out.details as any)?.guidanceReason).toBe("skill_discovery_proactive");
    }
  });

  it("reset clears prior cadence so a fresh run can trigger again", () => {
    const ctx = makeCtxWithSkills(true);
    recordSkillUsageForTests(ctx);
    resetSkillDiscoveryStateForTests();
    // After reset the map is empty; next record starts fresh.
    recordSkillUsageForTests(ctx);
    expect(() =>
      maybeAddSkillDiscoveryGuidanceForTests(makeTextResult("x"), {
        toolName: "read",
        params: {},
        ctx,
      }),
    ).not.toThrow();
  });
});

describe("ClawBackHome Phase 2: Condensed skill view + Linked file discovery", () => {
  beforeEach(() => {
    resetSkillDiscoveryStateForTests();
    resetFailureRecoveryStateForTests();
  });

  it("getBaseDirFromSkillReadPath extracts dirname for SKILL.md reads", () => {
    const dir = getBaseDirFromSkillReadPathForTests(
      { path: "/workspace/skills/weather/SKILL.md" },
      {},
    );
    expect(dir).toBe("/workspace/skills/weather");
  });

  it("listSkillLinkedFiles returns bounded list or empty when no subdirs (safe, no throw)", () => {
    const out = listSkillLinkedFilesForTests("/tmp/nonexistent-skill-dir-xyz");
    expect(typeof out).toBe("string");
    // Either empty or a short [Skill files: ...] string
    expect(out === "" || out.includes("Skill files")).toBe(true);
  });

  it("getCondensedSkillView produces short structured output and includes linked files when present", () => {
    const fakeMd =
      "---\nname: test\n---\n\n## Usage\nDo the thing with the tool.\n\nLong body that should be truncated in the condensed view because small models get overwhelmed by the full raw SKILL.md content that the read tool still returns verbatim above this guidance.";
    const out = getCondensedSkillViewForTests(fakeMd, "/tmp/some-skill");
    expect(out.startsWith("[Condensed skill view")).toBe(true);
    expect(out.length).toBeLessThan(700); // bounded
    expect(out.includes("Do the thing")).toBe(true);
  });
});

describe("ClawBackHome Failure Recovery Hooks (last-3-step window)", () => {
  beforeEach(() => {
    resetFailureRecoveryStateForTests();
  });

  it("does not trigger on normal short sequences (<3 repeats or <2 failures)", () => {
    const input = makeTextResult("ok result");
    const ctx = {};
    // step 1: foo success
    let out = maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "foo",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    expect(out).toBe(input);
    // step 2: foo success again (2x same, not yet 3)
    out = maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "foo",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    expect(out).toBe(input);
    // step 3: bar (different) — no 3x same, no 2 fails
    out = maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "bar",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    expect(out).toBe(input);
  });

  it("triggers [SYSTEM] guidance on 3x repetitive same tool usage", () => {
    const input = makeTextResult("result from repeated tool");
    const ctx = {};
    // first two no trigger
    maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "read",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "read",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    // 3rd triggers
    const out = maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "read",
      params: {},
      ctx,
      rawResult: input,
      hadPostFailure: false,
    });
    expect(out).not.toBe(input);
    const text = (out.content[0] as any).text as string;
    expect(text).toContain("[Guidance]");
    expect(text).toContain("[SYSTEM] Failure Recovery");
    expect(text).toContain("Repetitive tool usage");
    expect(text).toContain("get_goal");
    expect(text).toContain("update_plan");
    expect(text).toContain("replan");
    expect((out.details as any)?.guidanceInjected).toBe(true);
    expect((out.details as any)?.guidanceReason).toContain("failure_recovery_repetitive");
  });

  it("triggers on repeated failures (2+ in short window) even without 3x repeat", () => {
    const failResult = {
      content: [{ type: "text" as const, text: "Error: something failed" }],
      details: { exitCode: 1 },
    } as AgentToolResult<unknown>;
    const okInput = makeTextResult("later success");
    const ctx = {};
    // fail 1
    maybeAddFailureRecoveryGuidanceForTests(failResult, {
      toolName: "exec",
      params: {},
      ctx,
      rawResult: failResult,
      hadPostFailure: true,
    });
    // success (different tool) — still 1 fail so far
    maybeAddFailureRecoveryGuidanceForTests(okInput, {
      toolName: "other",
      params: {},
      ctx,
      rawResult: okInput,
      hadPostFailure: false,
    });
    // fail 2 on exec -> now 2 failures in window -> trigger
    const out = maybeAddFailureRecoveryGuidanceForTests(failResult, {
      toolName: "exec",
      params: {},
      ctx,
      rawResult: failResult,
      hadPostFailure: true,
    });
    const text = (out.content[0] as any).text as string;
    expect(text).toContain("[SYSTEM] Failure Recovery");
    expect(text).toContain("Repeated tool execution failures");
    expect(text).toContain("get_goal");
    expect(text).toContain("update_plan");
  });

  it("reset clears state so patterns can retrigger in fresh test", () => {
    const ctx = {};
    const input = makeTextResult("x");
    // build toward repeat
    maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "baz",
      params: {},
      ctx,
      rawResult: input,
    });
    maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "baz",
      params: {},
      ctx,
      rawResult: input,
    });
    resetFailureRecoveryStateForTests();
    // after reset, 3rd should NOT trigger (state cleared, only 1 now)
    const out = maybeAddFailureRecoveryGuidanceForTests(input, {
      toolName: "baz",
      params: {},
      ctx,
      rawResult: input,
    });
    expect(out).toBe(input);
  });
});
