---
summary: "execute_python: direct Python execution for reliable small-model and complex-script use (no escaping)"
read_when:
  - Using Python logic, calculations, or temp scripts from an agent
  - Avoiding shell escaping hell with python -c or bash -c
  - Working with 1B-4B class models that need structured, low-ambiguity tools
title: "Python execution (execute_python)"
---

`execute_python` runs Python source code directly. It is a core tool (included with shell tools for coding agents) designed to eliminate string escaping and temp-file management burdens that break small language models.

Use it instead of `exec` + `python -c "..."` or manually writing `.py` files via `write` then running them.

**Key principle**: the `code` parameter carries raw Python text (newlines, quotes, triple-quotes, long scripts). The structured tool-call format means zero shell escaping for the model.

## When to use

- Any Python computation, data transform, parsing, or one-off script the agent needs to run.
- Complex multi-line logic, functions, classes, or code with lots of quotes/escapes.
- Temp workflows: generate + execute Python that writes artifacts, then read the artifacts with `read`.
- Small models (≤4B): this tool + clear structured returns make reliable Python use possible without the model mastering shell quoting.

Do **not** use for:

- Long-running services or daemons (use `exec` + `process` or `cron`).
- When you specifically need a full shell environment or non-Python binaries.

## Parameters

<ParamField path="code" type="string" required>
The complete Python source to run. Can be any valid Python (imports, top-level code, `if __name__`, etc.). Newlines and special characters are passed literally.
</ParamField>

<ParamField path="cwd" type="string" optional>
Working directory for the Python process. Defaults to the agent's primary workspace when the runtime supplies it.
</ParamField>

<ParamField path="timeout" type="number" optional default="60">
Timeout in seconds. The process is killed on expiry. Set higher only for known long work.
</ParamField>

<ParamField path="env" type="object" optional>
Extra environment variables (string→string). Merged over the inherited environment. The runtime also sets `OPENCLAW_PYTHON_EXEC=1`.
</ParamField>

## Return value (always structured JSON)

The tool returns a JSON object (visible both as formatted text and as parsed `details`):

```json
{
  "stdout": "print output here\n",
  "stderr": "",
  "exit_code": 0,
  "duration": 123
}
```

- `exit_code`: 0 on success, non-zero on error, 124 on timeout, 127/ENOENT guidance appended when interpreter missing.
- `duration`: wall time in milliseconds.
- On any failure the result still contains all captured output + explicit alternative guidance (never "just retry").

## Examples

Minimal:

```json
{ "code": "print(2 + 2)" }
```

Multi-line with strings (no escaping needed in tool call):

```json
{
  "code": "def greet(name):\n    return f'Hello, {name}!'\n\nprint(greet('ClawBack'))\nwith open('out.txt', 'w') as f:\n    f.write('ok')\n"
}
```

With cwd and env:

```json
{
  "code": "import os; print(os.getcwd(), os.environ.get('MYVAR'))",
  "cwd": "/tmp/my-work",
  "env": { "MYVAR": "value42" },
  "timeout": 30
}
```

## Guidance for models (and operators)

When the task requires complex shell scripting or temporary logic that involves tricky string escaping (especially `bash -c`, `python -c`, complex `awk`, etc.), prefer `execute_python` over the `exec` tool.

The `exec` tool description also contains this reminder.

If Python is not installed, the result contains concrete next steps (full paths for `exec`, install instructions, Windows `py` launcher).

## Related

- [Exec](/tools/exec) — full shell. Use when you need bash, other languages, or process control.
- [Code execution](/tools/code-execution) — remote xAI sandboxed Python (different provider, no local files).
- [Read](/tools/read) / [Write](/tools/write) — for persisting or loading artifacts produced by Python runs.
- [Process](/tools/exec#process-tool) — follow background/long-running work started via other means.

This tool is part of OpenClaw's small-model-friendly additions (ClawBackHome philosophy): heavy, specialized tooling + explicit guidance so reliable behavior does not depend on model intelligence.
