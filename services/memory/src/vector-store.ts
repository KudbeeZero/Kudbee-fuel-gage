import { generateEmbedding, EMBEDDING_DIM } from './embedding-generator.js';

export interface MemoryRecord {
  id?: number;
  timestamp: string;
  context_type: string;
  payload: Record<string, unknown>;
  embedding: number[];
}

export interface SimilarityResult extends MemoryRecord {
  similarity: number;
}

export class VectorMemoryStore {
  private db: unknown;
  private embeddingProvider: unknown;

  constructor(db: unknown, embeddingProvider?: unknown) {
    this.db = db;
    this.embeddingProvider = embeddingProvider;
  }

  async upsert(record: Omit<MemoryRecord, 'id' | 'timestamp' | 'embedding'> & { embedding?: number[] }): Promise<number | null> {
    try {
      const embedding = record.embedding || await generateEmbedding(JSON.stringify(record.payload));
      const timestamp = new Date().toISOString();
      const payloadJson = JSON.stringify(record.payload);

      // Placeholder for database-specific insert
      const id = await this.executeInsert({
        table: 'vector_memory',
        columns: ['timestamp', 'context_type', 'payload', 'embedding'],
        values: [timestamp, record.context_type, payloadJson, JSON.stringify(embedding)]
      });

      return id;
    } catch (err) {
      console.error('[VectorMemory] Upsert failed:', err);
      return null;
    }
  }

  async search(queryText: string, limit = 5, contextType?: string): Promise<SimilarityResult[]> {
    try {
      const queryEmbedding = await generateEmbedding(queryText);
      const rows = await this.executeQuery({
        table: 'vector_memory',
        where: contextType ? { context_type: contextType } : undefined,
        orderBy: 'timestamp DESC',
        limit: 100
      });

      const results: SimilarityResult[] = [];
      for (const row of rows) {
        const embedding = this.parseEmbedding(row.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        results.push({
          id: row.id,
          timestamp: row.timestamp,
          context_type: row.context_type,
          payload: this.safeParse(row.payload),
          embedding,
          similarity
        });
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (err) {
      console.error('[VectorMemory] Search failed:', err);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0);
    }
    return dot;
  }

  private parseEmbedding(raw: string): number[] {
    try {
      return JSON.parse(raw);
    } catch {
      return new Array(EMBEDDING_DIM).fill(0);
    }
  }

  private safeParse(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async executeInsert(params: { table: string; columns: string[]; values: unknown[] }): Promise<number | null> {
    // Stub for database-specific insert implementation
    // In production, use parameterized queries to prevent SQL injection
    console.log(`[VectorMemory] INSERT into ${params.table}`, params.columns, params.values);
    return Date.now();
  }

  private async executeQuery(params: { table: string; where?: Record<string, unknown>; orderBy?: string; limit?: number }): Promise<unknown[]> {
    // Stub for database-specific query implementation
    console.log(`[VectorMemory] SELECT from ${params.table}`, params);
    return [];
  }
}
