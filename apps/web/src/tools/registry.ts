/**
 * KUDBEE Tool Registry
 * --------------------
 * Defines the tool-call protocol used by Qwen3:8b (and other tool-capable
 * models) when they emit `tool_calls` in their response.
 *
 * Tools are registered here with a JSON Schema so the model knows how to
 * invoke them, and an executor function that actually performs the work.
 */

/** JSON Schema for a tool parameter. */
export interface ToolParamSchema {
  type: "string" | "number" | "boolean";
  description: string;
  enum?: string[];
}

/** Full tool definition exposed to the model. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParamSchema>;
  required: string[];
}

/** A parsed tool-call extracted from the model's response. */
export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
}

/** Result returned by a tool executor. */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/** Async executor that handles a single tool call. */
export type ToolExecutor = (call: ToolCall) => Promise<ToolResult>;

/** Registered tool entry. */
export interface ToolEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/** Simple tool registry. */
export class ToolRegistry {
  private tools = new Map<string, ToolEntry>();

  register(entry: ToolEntry): void {
    this.tools.set(entry.definition.name, entry);
  }

  get(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const entry = this.tools.get(call.tool);
    if (!entry) {
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${call.tool}`,
      };
    }
    try {
      return await entry.executor(call);
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Shared singleton for the application. */
export const toolRegistry = new ToolRegistry();
