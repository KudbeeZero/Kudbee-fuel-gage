export interface NativeToolEntry {
  name: string;
  description?: string;
  handler: (
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; output: string; error?: string }>;
}

export class KudbeeNativeRegistry {
  private tools = new Map<string, NativeToolEntry>();

  register(entry: NativeToolEntry): void {
    this.tools.set(entry.name, entry);
  }

  async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const entry = this.tools.get(name);
    if (!entry) {
      return { success: false, output: '', error: `Unknown native tool: ${name}` };
    }
    try {
      return await entry.handler(args);
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  list(): NativeToolEntry[] {
    return Array.from(this.tools.values());
  }
}
