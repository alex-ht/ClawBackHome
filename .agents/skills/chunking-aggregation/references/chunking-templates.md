# Chunking & Aggregation Templates (self-contained)

These Python snippets are designed to be pasted directly into `execute_python` `code` parameters. They use only stdlib + `json`. Copy the exact block you need; no extra files required.

All functions return structured data with provenance so information integrity is preserved.

## Core Helpers

```python
import json
import re
from typing import Any

def chunk_by_lines(text: str, max_lines: int = 60, overlap: int = 2) -> list[dict[str, Any]]:
    """Simple, reliable line-based chunking. Returns list with source ranges."""
    lines = text.splitlines(keepends=True)
    chunks = []
    i = 0
    chunk_id = 0
    while i < len(lines):
        end = min(i + max_lines, len(lines))
        chunk_text = ''.join(lines[i:end])
        chunks.append({
            "chunk_id": chunk_id,
            "source": f"lines {i+1}-{end}",
            "content": chunk_text.rstrip('\n')
        })
        i = end - overlap if overlap > 0 and end < len(lines) else end
        chunk_id += 1
    return chunks

def chunk_by_paragraphs(text: str, max_chars: int = 3000) -> list[dict[str, Any]]:
    """Paragraph-aware chunking. Good for prose, logs, transcripts."""
    paras = re.split(r'\n\s*\n', text)
    chunks = []
    current = []
    current_len = 0
    chunk_id = 0
    for p in paras:
        p = p.strip()
        if not p:
            continue
        if current_len + len(p) > max_chars and current:
            chunks.append({
                "chunk_id": chunk_id,
                "source": f"para-group {chunk_id}",
                "content": '\n\n'.join(current)
            })
            chunk_id += 1
            current = []
            current_len = 0
        current.append(p)
        current_len += len(p) + 2
    if current:
        chunks.append({
            "chunk_id": chunk_id,
            "source": f"para-group {chunk_id}",
            "content": '\n\n'.join(current)
        })
    return chunks

def chunk_code_blocks(text: str, max_lines: int = 80) -> list[dict[str, Any]]:
    """Code-aware: tries to keep functions/classes together when possible."""
    lines = text.splitlines(keepends=True)
    chunks = []
    i = 0
    chunk_id = 0
    while i < len(lines):
        end = min(i + max_lines, len(lines))
        # naive: extend to next blank line or def/class if near boundary
        if end < len(lines):
            for j in range(end, min(end + 8, len(lines))):
                if lines[j].strip().startswith(('def ', 'class ', 'async def ')):
                    end = j
                    break
        chunk_text = ''.join(lines[i:end])
        chunks.append({
            "chunk_id": chunk_id,
            "source": f"code-lines {i+1}-{end}",
            "content": chunk_text.rstrip('\n')
        })
        i = end
        chunk_id += 1
    return chunks
```

## Aggregation Helper

```python
def aggregate_results(chunks_with_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Standard reducer. Expects list of {'chunk_id': int, 'source': str, 'result': any}"""
    summary = {
        "total_chunks": len(chunks_with_results),
        "sources": [c["source"] for c in chunks_with_results],
        "findings": [],
        "raw_results": chunks_with_results
    }
    # Example: flatten string results or collect structured ones
    for c in chunks_with_results:
        r = c.get("result")
        if isinstance(r, str):
            summary["findings"].append(f"[{c['source']}] {r[:200]}")
        elif isinstance(r, (dict, list)):
            summary["findings"].append({"source": c["source"], "data": r})
    return summary
```

## Complete End-to-End Example (paste this into execute_python)

```python
# --- BEGIN TEMPLATE: long-file analysis with chunking ---
import json

# 1. SEGMENT (example: you already read the file into TEXT via read tool or previous step)
TEXT = """PASTE OR LOAD THE LARGE CONTENT HERE (in real use, pass via env or previous chunk result)"""
# In practice the model will fill TEXT from a prior read or tool output.

# 2. CHOOSE STRATEGY & SEGMENT
chunks = chunk_by_lines(TEXT, max_lines=55, overlap=3)   # or chunk_by_paragraphs / chunk_code_blocks

print(f"Segmented into {len(chunks)} chunks")

# 3. PROCESS IN ISOLATION (model does one chunk per execute_python call in real flow)
# For demo we simulate. In real work, the model calls execute_python once per chunk
# with only that chunk's content + a narrow task instruction.

processed = []
for ch in chunks[:3]:  # model would do this loop across separate turns
    # Example per-chunk task: "Extract all function names and their first-line purpose"
    # (model would send a fresh execute_python for this chunk only)
    fake_result = f"functions found in {ch['source']}: example_func_a, example_func_b"
    processed.append({
        "chunk_id": ch["chunk_id"],
        "source": ch["source"],
        "result": fake_result
    })

# 4. SYNTHESIZE (final aggregation turn — only after all chunks done)
agg = aggregate_results(processed)
print(json.dumps(agg, indent=2, ensure_ascii=False))

# 5. After this aggregation, the model MUST call:
#    get_goal   (recall original objective)
#    update_plan (mark the "chunked analysis" step complete, set next step)
# --- END TEMPLATE ---
```

## Usage Pattern with Progress Hooks (critical for long tasks)

After finishing chunk N (or every 2 chunks):

1. Call `get_goal` with no args to reload the original task statement.
2. Call `update_plan` with the current step marked done and the next chunk step marked `in_progress`.
3. Only then start processing chunk N+1.

This prevents drift on complex multi-chunk work.

## Provenance Rules (never violate)

- Every result dict **must** contain `source` with file/line or transcript timestamp/turn id.
- When writing artifacts, include the chunk source in the filename or header.
- When synthesizing, always carry the source list forward in the final output.
- If a chunk fails, record the failure with its exact source range so you can resume precisely.

## Common Strategies by Content Type

- Source code / large diffs → `chunk_code_blocks` or `chunk_by_lines` (80 lines)
- Meeting transcripts / logs → `chunk_by_paragraphs` (2500-4000 chars)
- Very long single files → first `chunk_by_lines(40)` then re-chunk interesting ranges with tighter granularity
- JSON/structured data → split on top-level array/object boundaries using simple python (never let the model guess)

## Recovery

- Lost context mid-task? Immediately `get_goal` + `update_plan` before doing anything else.
- Bad chunk boundary? Re-segment that region with overlap and re-process only the affected chunks.
- Aggregation looks incomplete? Ask for the raw `processed` list from previous turns and re-run only the aggregator.

Copy the helpers you need. Keep every chunk self-contained. Aggregate only at the end. Update the plan between phases.

This is the ClawBackHome default for large content.