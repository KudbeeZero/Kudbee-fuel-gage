import type { AgentMemoryChunk, MemoryRetrievalQuery } from '@kudbee/types';

interface SemanticRecallOptions {
  embeddingEnabled?: boolean;
  similarityThreshold?: number;
}

export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) return 0;
  const dims = Math.min(vecA.length, vecB.length);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < dims; i++) {
    dotProduct += (vecA[i] ?? 0) * (vecB[i] ?? 0);
    normA += (vecA[i] ?? 0) * (vecA[i] ?? 0);
    normB += (vecB[i] ?? 0) * (vecB[i] ?? 0);
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function recallSimilarMemories(
  query: MemoryRetrievalQuery,
  chunks: AgentMemoryChunk[],
  options: SemanticRecallOptions = {}
): AgentMemoryChunk[] {
  const threshold = options.similarityThreshold ?? 0.1;
  const embeddingEnabled = options.embeddingEnabled ?? false;

  const scored: Array<{ chunk: AgentMemoryChunk; score: number }> = [];
  const queryTerms = query.query.toLowerCase().split(/\s+/).filter(Boolean);

  for (const chunk of chunks) {
    if (Date.now() - new Date(chunk.storedAt).getTime() > chunk.ttlMs) {
      continue;
    }

    if (
      query.categoryFilter.length > 0 &&
      !query.categoryFilter.includes(chunk.category)
    ) {
      continue;
    }

    const contentLower = chunk.content.toLowerCase();
    let textScore = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        textScore += 1;
      }
    }

    textScore = textScore / Math.max(1, queryTerms.length);

    let vectorScore = 0;
    if (embeddingEnabled && chunk.embedding.length > 0) {
      const dummyQueryEmbedding = queryTerms.map(
        (_, i) => (i + 1) / queryTerms.length
      ).slice(0, chunk.embedding.length);

      vectorScore = computeCosineSimilarity(dummyQueryEmbedding, chunk.embedding);
    }

    const totalScore = embeddingEnabled
      ? textScore * 0.6 + vectorScore * 0.4
      : textScore + chunk.importance * 0.3;

    if (totalScore >= threshold) {
      scored.push({ chunk, score: totalScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, query.limit).map((r) => r.chunk);
}

export function formatRecallResults(
  chunks: AgentMemoryChunk[],
  maxChars: number = 4000
): string {
  if (chunks.length === 0) return '[No relevant memories found]';

  const parts = chunks.map((chunk) =>
    `[${chunk.category}] ${chunk.content} (agent: ${chunk.agentId}, importance: ${chunk.importance.toFixed(1)})`
  );

  let result = parts.join('\n---\n');
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 50) + '\n... [truncated]';
  }

  return result;
}
