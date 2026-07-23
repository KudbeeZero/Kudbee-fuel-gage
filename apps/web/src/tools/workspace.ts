/**
 * KUDBEE Workspace Tools — FileSystemManager & ShellExecutor
 * ----------------------------------------------------------
 * These tools give KUDBEE the ability to read/write workspace files
 * and execute isolated shell commands, all through backend API calls
 * that validate paths against the workspace root.
 */

import { toolRegistry } from "./registry";
import type { ToolCall, ToolResult } from "./registry";

// Path validation happens server-side in services/ingestion/routes/tools.ts.
// This client-side constant is a fallback; the actual workspace root is
// resolved by the backend API for security.
const WORKSPACE_ROOT = (typeof window !== "undefined" && (window as any).__WORKSPACE_ROOT__)
  || "/teamspace/studios/this_studio";

/* ------------------------------------------------------------------ */
/* FileSystemManager                                                   */
/* ------------------------------------------------------------------ */

async function readFileTool(call: ToolCall): Promise<ToolResult> {
  const filePath = call.params.path as string;
  if (!filePath) return { success: false, output: "", error: "Missing 'path'" };

  try {
    const res = await fetch("/api/tools/fs/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    const data = (await res.json()) as { content?: string; error?: string };
    if (!res.ok) return { success: false, output: "", error: data.error ?? "Read failed" };
    return { success: true, output: data.content ?? "" };
  } catch (err) {
    return { success: false, output: "", error: String(err) };
  }
}

async function writeFileTool(call: ToolCall): Promise<ToolResult> {
  const filePath = call.params.path as string;
  const content = call.params.content as string;
  if (!filePath) return { success: false, output: "", error: "Missing 'path'" };
  if (content === undefined) return { success: false, output: "", error: "Missing 'content'" };

  try {
    const res = await fetch("/api/tools/fs/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) return { success: false, output: "", error: data.error ?? "Write failed" };
    return { success: true, output: `Wrote ${content.length} bytes to ${filePath}` };
  } catch (err) {
    return { success: false, output: "", error: String(err) };
  }
}

async function listFilesTool(call: ToolCall): Promise<ToolResult> {
  const dirPath = (call.params.path as string) ?? ".";
  try {
    const res = await fetch("/api/tools/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dirPath }),
    });
    const data = (await res.json()) as { entries?: string[]; error?: string };
    if (!res.ok) return { success: false, output: "", error: data.error ?? "List failed" };
    return { success: true, output: (data.entries ?? []).join("\n") };
  } catch (err) {
    return { success: false, output: "", error: String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* ShellExecutor                                                       */
/* ------------------------------------------------------------------ */

async function shellExecTool(call: ToolCall): Promise<ToolResult> {
  const command = call.params.command as string;
  if (!command) return { success: false, output: "", error: "Missing 'command'" };
  const cwd = (call.params.cwd as string) ?? WORKSPACE_ROOT;

  try {
    const res = await fetch("/api/tools/shell/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, cwd }),
    });
    const data = (await res.json()) as { stdout?: string; stderr?: string; exitCode?: number; error?: string };
    if (!res.ok) return { success: false, output: "", error: data.error ?? "Shell exec failed" };
    return {
      success: data.exitCode === 0,
      output: (data.stdout ?? "") + (data.stderr ? `\n[stderr]\n${data.stderr}` : ""),
    };
  } catch (err) {
    return { success: false, output: "", error: String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerWorkspaceTools(): void {
  toolRegistry.register({
    definition: {
      name: "read_file",
      description: "Read the contents of a file in the workspace",
      parameters: {
        path: { type: "string", description: "Absolute or relative file path" },
      },
      required: ["path"],
    },
    executor: readFileTool,
  });

  toolRegistry.register({
    definition: {
      name: "write_file",
      description: "Write content to a file in the workspace (creates or overwrites)",
      parameters: {
        path: { type: "string", description: "Absolute or relative file path" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
    executor: writeFileTool,
  });

  toolRegistry.register({
    definition: {
      name: "list_files",
      description: "List files and directories at the given path",
      parameters: {
        path: { type: "string", description: "Directory path (defaults to workspace root)" },
      },
      required: [],
    },
    executor: listFilesTool,
  });

  toolRegistry.register({
    definition: {
      name: "shell_exec",
      description: "Execute a shell command in the workspace",
      parameters: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory (defaults to workspace root)" },
      },
      required: ["command"],
    },
    executor: shellExecTool,
  });
}
