export interface NativeToolEntry {
  name: string;
  description?: string;
  handler: (
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; output: string; error?: string }>;
}

export class Tool {
  static define(entry: NativeToolEntry): NativeToolEntry {
    return entry;
  }
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

export function registerKudbeeRecallAndMintTools(registry: KudbeeNativeRegistry): void {
  registry.register(
    Tool.define({
      name: 'kudbee_recall_memories',
      description: 'Recall memories via pgvector similarity search',
      handler: async (args) => {
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        return {
          success: true,
          output: JSON.stringify({ query, limit, memories: [] })
        };
      }
    })
  );

  registry.register(
    Tool.define({
      name: 'kudbee_mint_think_token',
      description: 'Mint a think token for a reasoning trajectory',
      handler: async (args) => {
        const coords = Array.isArray(args.spatial_coordinates)
          ? (args.spatial_coordinates as [number, number, number])
          : [0, 0, 0];
        const scale = typeof args.scale_factor === 'number' ? args.scale_factor : 1;
        const proven = typeof args.proven_mode === 'boolean' ? args.proven_mode : false;
        const { mintToken } = await import('./mint');
        const token = await mintToken({ spatial_coordinates: coords, scale_factor: scale, proven_mode: proven });
        return { success: true, output: JSON.stringify(token) };
      }
    })
  );
}
