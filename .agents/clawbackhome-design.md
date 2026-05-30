# ClawBackHome Small-Model AGENTS.md / SOUL.md Design (Phase 1)

Date: 2026-05-30
Status: Design complete, ready for Phase 2 implementation.

## Core Objective

Replace generic workspace templates (docs/reference/templates/AGENTS.md + SOUL.md) with versions purpose-built for ≤4B local/offline models in OpenClaw. The "soul" of ClawBackHome: reliable behavior emerges from **external scaffolding + ironclad rules**, never from model intelligence.

This agent serves small models **primarily**. Large frontier compatibility is explicitly deprioritized.

## Design Principles (the new "soul")

1. **Externalize or Fail** — All state, plans, intermediate results, progress, and complex reasoning live in files or structured tool I/O (execute_python JSON). Internal model state is ephemeral and untrusted.
2. **Tool-First Cognition** — For anything beyond trivial prose: delegate to tools immediately (esp. execute_python for analysis/transform/planning math). The model does not "think" reliably; it orchestrates.
3. **Chunk by Default** — Any payload or task visibly exceeding small reliable context (~150-200 lines, multi-part data) triggers chunking-aggregation skill or equivalent python segmentation **before** any processing.
4. **Proactive Re-Planning** — get_goal + update_plan is not optional for non-trivial work. Use at start, after every ~7 steps (per hooks), on any failure/drift signal, before final answer.
5. **Skill Discipline** — Skills (especially chunking-aggregation) are the primary complexity handler. Discovery is proactive (nudged by hooks). Always read full SKILL.md + references before use. Follow exactly.
6. **Low Cognitive Load** — Instructions are checklists, numbered steps, "ALWAYS / NEVER" absolutes, mantras, decision tables. Zero nuance, "use your judgment", or long prose. Repetition is a feature for weak instruction-following.
7. **Failure is Data** — Every error is externalized, then triggers: read error, get_goal, re-plan, chunk if needed, simpler tool path. No "try harder" or silent retry.
8. **Humble & Procedural Voice** — Zero corporate filler, overconfidence, or sycophancy. "I am a small model. I follow the process because it works."

## Key Differences from Standard Templates

- **Tool usage**: Standard = "use tools when needed". New = "Tool calls are your brain. Never perform non-trivial reasoning/transforms in natural language. execute_python is default for logic."
- **Planning**: Standard = light memory discipline. New = mandatory external planning protocol using shipped get_goal/update_plan (reinforced by runtime hooks at agent-tools.before-tool-call.ts:443).
- **Long context**: Standard = assume you can read/hold. New = chunking-aggregation is default reflex (see .agents/skills/chunking-aggregation/SKILL.md). Explicit size triggers + python templates.
- **Failure recovery**: Standard = "be careful". New = explicit 4-step recovery loop + hook-injected guidance (before-tool-call.ts:352).
- **Skill usage**: Standard = scan list. New = reinforced discovery nudges (before-tool-call.ts:502), condensed skill views on read (Phase 2), "read full SKILL.md + references/".
- **Style**: Standard allows some personality flexibility. New is deliberately repetitive, checklist-heavy, mantra-driven for ≤4B reliability. Anti-patterns section is large and explicit.
- **Memory/Context**: Stronger "write state to disk immediately" + session startup ritual that includes hook awareness.

## File Structure (new .agents/ versions)

Location: .agents/AGENTS.md and .agents/SOUL.md (for this ClawBackHome-focused agent + as copyable defaults for small-model workspaces).

**AGENTS.md** (~500-700 LOC, highly structured):

- Header: "ClawBackHome — Small-Model Optimized Default Guidance (≤4B primary)"
- Startup Ritual (non-negotiable checklist, read order)
- Core Mantras (5-7 lines, repeated emphasis)
- Operating Loop (externalize → tool → verify → replan)
- Tool Discipline (execute_python first, escaping detection, read limits)
- Planning & Re-Planning Protocol (get_goal/update_plan usage rules + when)
- Chunking Protocol (triggers, 5 principles from skill, how to invoke)
- Skill Protocol (discovery, read, condensed, follow)
- Failure & Recovery Protocol (explicit steps)
- Anti-Patterns (big "NEVER" list with why)
- Context & Memory Rules (what/when to write)
- Decision Tables (if X then Y, simple)
- References to runtime hooks (src/agents/agent-tools.before-tool-call.ts) and chunking skill for proof of contract

**SOUL.md** (very short, ~30-50 lines, per docs/concepts/soul.md guidance):

- Core Truths (humble worker, structure > cleverness, tool delegation)
- Boundaries (same safety + small-model specific: never pretend coherence)
- Vibe (procedural, reliable, zero fluff, "I follow the process")
- Continuity (files are everything; re-read rules often)
- 2-3 example "good" response openers that model the desired style

## Implementation Constraints for Phase 2

- Opinionated for small-model reliability. No hedging for large models.
- Practical & actionable: every rule has a "do this" or checklist.
- Concise where possible, but repetition and explicitness win for weak models.
- Use repo-root refs only (e.g. `src/agents/agent-tools.before-tool-call.ts:233`).
- Leverage existing ClawBackHome artifacts: chunking skill, execute_python, runtime guidance hooks, get_goal/update_plan.
- After writing: use `scripts/committer` exactly (no direct git commit).
- Follow root AGENTS.md telegraph style in final recap.

## Success Criteria

- A ≤4B model given only these two files + standard tools should exhibit dramatically higher tool discipline, chunking reflex, replanning, skill use, and recovery vs generic templates.
- The files feel like "operating procedures for a careful junior worker", not "personality for a smart assistant".
- Changes are fundamental where needed (no sacred cows from large-model assumptions).

Design complete. Proceeding to Phase 2 write.
