import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TSchema } from "typebox";
import type { AnyAgentTool } from "./agent-tools.types.js";
import { pythonExecSchema } from "./bash-tools.schemas.js";
import type { AgentToolResult } from "./runtime/index.js";
import { jsonResult } from "./tools/common.js";
import { spawnProcess, waitForChildProcess } from "./utils/child-process.js";

export type PythonExecToolDefaults = {
  cwd?: string;
  timeoutSec?: number;
};

export type PythonExecResult = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration: number; // ms
};

const DEFAULT_TIMEOUT_SEC = 60;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MiB safety cap per stream (small-model friendly; large output should chunk)

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [truncated ${s.length - max} bytes]`;
}

function pickPythonBin(): string {
  // Prefer python3 on Unix, python on Windows; fallbacks are handled at runtime with guidance
  return process.platform === "win32" ? "python" : "python3";
}

async function runPythonInternal(params: {
  code: string;
  cwd?: string;
  timeoutSec?: number;
  env?: Record<string, string>;
}): Promise<PythonExecResult> {
  const start = Date.now();
  const bin = pickPythonBin();
  const timeoutSec = params.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const timeoutMs = Math.max(0, Math.floor(timeoutSec * 1000));

  // Use a dedicated temp dir for this execution (clean isolation)
  const workDir = join(
    tmpdir(),
    `openclaw-py-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const scriptPath = join(workDir, "snippet.py");

  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let timedOut = false;

  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(scriptPath, params.code, "utf8");

    const childCwd = params.cwd?.trim() || process.cwd();
    const childEnv = {
      ...process.env,
      ...(params.env ?? {}),
      // Mark context for any python profile/debug hooks the user may have
      OPENCLAW_PYTHON_EXEC: "1",
    } as NodeJS.ProcessEnv;

    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    const child = spawnProcess(bin, [scriptPath], {
      cwd: childCwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      signal: controller.signal,
      windowsHide: true,
    });

    // Collect output with backpressure safety
    const pushOut = (chunk: Buffer | string) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > MAX_OUTPUT_BYTES) {
        stdout = truncate(stdout, MAX_OUTPUT_BYTES);
      }
    };
    const pushErr = (chunk: Buffer | string) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > MAX_OUTPUT_BYTES) {
        stderr = truncate(stderr, MAX_OUTPUT_BYTES);
      }
    };

    child.stdout?.on("data", pushOut);
    child.stderr?.on("data", pushErr);

    try {
      exitCode = await waitForChildProcess(child);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError" || timedOut) {
        exitCode = 124; // conventional timeout code
        stderr += (stderr ? "\n" : "") + `[execute_python] timed out after ${timeoutSec}s`;
      } else {
        throw e;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }

    // Best-effort kill if still alive after abort
    if (child.killed || controller.signal.aborted) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr = (stderr ? stderr + "\n" : "") + `[execute_python] internal error: ${msg}`;
    if (exitCode === null) exitCode = 1;
  } finally {
    // Always clean the temp script dir (best effort, non-fatal)
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }

  const duration = Date.now() - start;

  // If python bin was missing, give actionable guidance (never "try again")
  if (stderr.includes("ENOENT") || (exitCode === 127 && stderr.toLowerCase().includes("python"))) {
    const guidance =
      "Python interpreter not found in PATH. " +
      'Alternatives: (1) use the `exec` tool with an explicit full path to python3/python (e.g. `/usr/bin/python3 -c "..."` or `C:\\Python\\python.exe`); ' +
      "(2) install Python 3 and ensure it is on PATH; " +
      "(3) on Windows, try `py -3` via exec if python launcher is installed.";
    stderr = (stderr ? stderr + "\n" : "") + guidance;
  }

  return {
    stdout: truncate(stdout, MAX_OUTPUT_BYTES),
    stderr: truncate(stderr, MAX_OUTPUT_BYTES),
    exit_code: exitCode,
    duration,
  };
}

export async function executePython(
  params: { code: string; cwd?: string; timeout?: number; env?: Record<string, string> },
  defaults?: PythonExecToolDefaults,
): Promise<AgentToolResult<unknown>> {
  const code = typeof params.code === "string" ? params.code : "";
  if (!code.trim()) {
    return jsonResult({
      stdout: "",
      stderr: "execute_python: 'code' must be a non-empty string",
      exit_code: 2,
      duration: 0,
    }) as AgentToolResult<unknown>;
  }

  const result = await runPythonInternal({
    code,
    cwd: params.cwd ?? defaults?.cwd,
    timeoutSec: params.timeout ?? defaults?.timeoutSec,
    env: params.env,
  });

  return jsonResult(result) as AgentToolResult<unknown>;
}

export function createExecutePythonTool(defaults?: PythonExecToolDefaults): AnyAgentTool {
  const tool: AnyAgentTool = {
    name: "execute_python",
    label: "execute_python",
    description:
      "Execute Python code directly in a clean temporary context. " +
      "Pass the complete Python source (any length, any characters, multi-line, triple-quoted strings, etc.) in the `code` parameter — the tool call format carries it without shell escaping. " +
      "This is the preferred tool for calculations, data processing, temp scripts, or any logic that would otherwise require tricky `python -c` or `bash -c` escaping. " +
      "When the task requires complex shell scripting or temporary logic that involves tricky string escaping (especially `bash -c`, `python -c`, complex `awk`, etc.), prefer `execute_python` over the `exec` tool. " +
      "Returns structured result: { stdout, stderr, exit_code, duration (ms) }. " +
      "On failure, the result still contains the captured output plus guidance for alternatives. " +
      "cwd defaults to the agent's workspace when provided by the runtime. " +
      "Use `timeout` (seconds) for long-running work; default is 60s. " +
      "The executed code sees OPENCLAW_PYTHON_EXEC=1 in its environment.",
    parameters: pythonExecSchema as TSchema,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // signal/onUpdate ignored for this sync-style tool (fast by design for small models)
      void toolCallId;
      void signal;
      void onUpdate;
      return executePython(params as any, defaults);
    },
  };
  return tool;
}
