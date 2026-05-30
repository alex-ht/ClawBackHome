---
name: chunking-aggregation
description: "Chunk → Process → Aggregate pattern for reliable handling of long files, transcripts, and complex multi-step tasks with small models. External structure using execute_python + progress hooks."
user-invocable: true
---

# Chunking & Aggregation

Use for any large content that risks one-shot failure on ≤4B models: long files, full transcripts, large diffs, complex tasks spanning many artifacts.

## Triggers (apply immediately)
- `read` returns truncated output or line range hints
- Input size or task complexity visibly exceeds small-model reliable capacity
- User requests analysis/summary/processing of "the whole thing" or long-running work
- Before any one-shot pass over >200 lines or multi-part structured data

## The 5 Principles (make this your default habit)
1. **Segment Before Processing** — Split deterministically first. Never hand the full payload to the model.
2. **Process in Isolation** — Each chunk gets its own clean context and execution. No leaking state between chunks inside the model.
3. **Synthesize Thoughtfully** — Only after every chunk is fully processed, aggregate with structured data (JSON arrays of `{chunk_id, source, result}`).
4. **Preserve Information Integrity** — Every chunk carries provenance (file path + line range or original identifiers). Never drop ordering or source markers.
5. **Make Chunking a Default Behavior** — For anything "large", default to this pattern. Do not gamble on model long-context magic.

## ClawBackHome Integration (required companions)
- **execute_python**: All segmentation logic, per-chunk processing, and final aggregation. Zero escaping. Structured JSON in/out.
- **Progress Tracking Hooks**: After each chunk (or every 2-3 chunks), call `get_goal` then `update_plan` to mark progress against the original objective before continuing.
- For durable cross-session chunked work, combine with the `taskflow` skill.

## Minimal Workflow
1. Detect large input.
2. Choose segmentation (lines / paragraphs / code blocks / simple token estimate).
3. For each chunk: process in isolation → capture `{source, result}`.
4. After all chunks: aggregate (merge, rank, summarize findings).
5. `get_goal` + `update_plan` + final report.

Full self-contained Python templates, ready-to-paste execute_python blocks, chunk strategies, and detailed playbooks live in the references (loaded only when needed):

`{baseDir}/references/chunking-templates.md`

Read that file the first time you use this skill or when you need a concrete template.