import { EMBEDDING_DIM, cosineSimilarity } from './embedding-fallback.js';

export interface EmbeddingProvider {
  name: string;
  embed(text: string): Promise<number[]>;
  dimension: number;
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  name = 'local-hash';
  dimension = EMBEDDING_DIM;

  async embed(text: string): Promise<number[]> {
    try {
      const { embedText } = await import('./embedding-fallback.js');
      return embedText(text);
    } catch (err) {
      console.error('[Embedding] Local hash embedding failed:', err);
      return new Array(EMBEDDING_DIM).fill(0);
    }
  }
}

export class GoogleTextEmbeddingProvider implements EmbeddingProvider {
  name = 'google-text-embedding-004';
  dimension = 768;
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            parts: [{ text }]
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Embedding API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { embedding?: { values?: number[] } };
      const values = data.embedding?.values;
      if (!values || values.length === 0) {
        throw new Error('Empty embedding response from Google API');
      }

      return values;
    } catch (err) {
      console.error('[Embedding] Google text-embedding-004 failed, falling back to local:', err);
      const fallback = new LocalHashEmbeddingProvider();
      return fallback.embed(text);
    }
  }
}

export class EmbeddingFactory {
  static create(apiKey?: string): EmbeddingProvider {
    if (apiKey && apiKey.trim().length > 0) {
      return new GoogleTextEmbeddingProvider(apiKey);
    }
    return new LocalHashEmbeddingProvider();
  }
}

export async function generateEmbedding(text: string, apiKey?: string): Promise<number[]> {
  const provider = EmbeddingFactory.create(apiKey);
  return provider.embed(text);
}
