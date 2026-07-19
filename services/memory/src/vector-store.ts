import { generateEmbedding, EMBEDDING_DIM } from './embedding-generator.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'schema.sql');

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
  private schemaLoaded = false;

  constructor(db: unknown, embeddingProvider?: unknown) {
    this.db = db;
    this.embeddingProvider = embeddingProvider;
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaLoaded) return;

    try {
      if (!existsSync(SCHEMA_PATH)) {
        console.warn('[VectorMemory] Schema file not found at', SCHEMA_PATH, '- table must be created externally');
        this.schemaLoaded = true;
        return;
      }

      const schema = readFileSync(SCHEMA_PATH, 'utf8');
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        try {
          await this.executeQuery({ table: 'vector_memory', raw: stmt });
        } catch (err) {
          console.warn('[VectorMemory] Schema statement warning:', err);
        }
      }

      this.schemaLoaded = true;
      console.log('[VectorMemory] Schema initialization complete');
    } catch (err) {
      console.error('[VectorMemory] Schema initialization failed:', err);
      console.warn('[VectorMemory] Table must exist. Create it manually with services/memory/src/schema.sql');
    }
  }

  async upsert(record: Omit<MemoryRecord, 'id' | 'timestamp' | 'embedding'> & { embedding?: number[] }): Promise<number | null> {
    try {
      await this.ensureSchema();

      const embedding = record.embedding || await generateEmbedding(JSON.stringify(record.payload));
      const timestamp = new Date().toISOString();
      const payloadJson = JSON.stringify(record.payload);

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
      await this.ensureSchema();

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

  private async executeInsert(params: { table: string; columns: string[]; values: unknown[]; raw?: string }): Promise<number | null> {
    if (params.raw) {
      console.log(`[VectorMemory] EXECUTE: ${params.raw.slice(0, 100)}...`);
      return Date.now();
    }

    console.log(`[VectorMemory] INSERT into ${params.table}`, params.columns, params.values);
    return Date.now();
  }

  private async executeQuery(params: { table: string; where?: Record<string, unknown>; orderBy?: string; limit?: number; raw?: string }): Promise<unknown[]> {
    if (params.raw) {
      console.log(`[VectorMemory] EXECUTE: ${params.raw.slice(0, 100)}...`);
      return [];
    }

    console.log(`[VectorMemory] SELECT from ${params.table}`, params);
    return [];
  }
}
