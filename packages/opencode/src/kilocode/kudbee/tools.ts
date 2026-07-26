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
      name: 'kudbee_store_memory',
      description: 'Store a fact, observation, decision, or error into persistent agent memory',
      handler: async (args) => {
        try {
          const { MemoryVault } = await import('../../../../../services/memory/src/memoryVault.ts');
          const vault = new MemoryVault({ maxChunks: 500 });
          const chunk = vault.store({
            agentId: typeof args.agent_id === 'string' ? args.agent_id : 'unknown',
            content: typeof args.content === 'string' ? args.content : JSON.stringify(args),
            category: (['FACT', 'OBSERVATION', 'DECISION', 'ERROR', 'TOOL_CALL'] as const).includes(
              typeof args.category === 'string' ? args.category as 'FACT' : 'FACT'
            ) ? (args.category as 'FACT') : 'FACT',
            importance: typeof args.importance === 'number' ? args.importance : 0.5,
            embedding: Array.isArray(args.embedding) ? args.embedding as number[] : [],
            metadata: typeof args.metadata === 'object' && args.metadata ? args.metadata as Record<string, unknown> : {},
            ttlMs: typeof args.ttl_ms === 'number' ? args.ttl_ms : 7 * 86400_000
          });
          return { success: true, output: JSON.stringify({ id: chunk.id, category: chunk.category, storedAt: chunk.storedAt }) };
        } catch (err) {
          return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
        }
      }
    })
  );

  registry.register(
    Tool.define({
      name: 'kudbee_recall_memories',
      description: 'Recall memories by keyword query with optional category filter',
      handler: async (args) => {
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const minSimilarity = typeof args.min_similarity === 'number' ? args.min_similarity : 0.1;
        const categoryFilter: string[] = Array.isArray(args.category_filter) ? args.category_filter as string[] : [];
        return {
          success: true,
          output: JSON.stringify({ query, limit, minSimilarity, categoryFilter, memories: [] })
        };
      }
    })
  );

  registry.register(
    Tool.define({
      name: 'kudbee_mint_think_token',
      description: 'Mint a think token for a reasoning trajectory',
      handler: async (args) => {
        const raw = Array.isArray(args.spatial_coordinates) ? args.spatial_coordinates : [0, 0, 0];
        const coords: [number, number, number] = [Number(raw[0]) || 0, Number(raw[1]) || 0, Number(raw[2]) || 0];
        const scale = typeof args.scale_factor === 'number' ? args.scale_factor : 1;
        const proven = typeof args.proven_mode === 'boolean' ? args.proven_mode : false;
        const { mintToken } = await import('./mint');
        const token = await mintToken({ spatial_coordinates: coords, scale_factor: scale, proven_mode: proven });
        return { success: true, output: JSON.stringify(token) };
      }
    })
  );
}

export function registerKudbeeNativeTools(registry: KudbeeNativeRegistry): void {
  registerKudbeeRecallAndMintTools(registry);
  registerKudbeeGovernanceTools(registry);
}

export function registerKudbeeGovernanceTools(registry: KudbeeNativeRegistry): void {
  registry.register(
    Tool.define({
      name: 'kudbee_propose_governance',
      description: 'Propose a governance action for high-risk changes',
      handler: async (args) => {
        const title = typeof args.title === 'string' ? args.title : 'Untitled Proposal';
        const description = typeof args.description === 'string' ? args.description : '';
        const risk = typeof args.risk_level === 'string' ? args.risk_level : 'MEDIUM';
        return {
          success: true,
          output: JSON.stringify({
            id: `gov-${Date.now()}`,
            title,
            description,
            risk_level: risk,
            status: 'PENDING'
          })
        };
      }
    })
  );
}
