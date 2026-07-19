/**
 * scripts/ingest-topology.ts
 * ---------------------------------------------------------------------------
 * Self-Ingestion Pipeline — seeds the Self-Aware Vector Memory Layer.
 *
 * Combines the PR #42 GitHub Connector (live remote file reads) with the local
 * embedding client to chunk the system blueprint (claude.md, the Agentic Rack
 * layout files, and the governance router rules), embed each chunk, and store
 * it in `system_topology_embeddings`.
 *
 * Resilient-First: reads local files when available; if GITHUB_PAT + a repo
 * are configured it preferentially pulls the canonical remote copy via the
 * connector. Missing/empty files are skipped with a warning, never fatal.
 * ---------------------------------------------------------------------------
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchFile } from '../services/github/connector.ts';
import { embedText } from '../services/memory/embedText.ts';
import { storeSystemChunk, type TopologyMetadata } from '../services/memory/vectorStore.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = process.env.TOPOLOGY_REPO || ''; // "owner/repo" — enables live remote pull
const VERSION = process.env.npm_package_version || '1.0.0';

interface SourceFile {
  localPath: string;
  remotePath: string; // appended to REPO when pulling live
  category: TopologyMetadata['category'];
}

const SOURCES: SourceFile[] = [
  { localPath: 'claude.md', remotePath: 'claude.md', category: 'doc' },
  { localPath: 'apps/web/src/components/RackLayout.tsx', remotePath: 'apps/web/src/components/RackLayout.tsx', category: 'layout' },
  { localPath: 'apps/web/src/components/PluginCard.tsx', remotePath: 'apps/web/src/components/PluginCard.tsx', category: 'layout' },
  { localPath: 'apps/web/src/registry/frontend-plugins.ts', remotePath: 'apps/web/src/registry/frontend-plugins.ts', category: 'layout' },
  { localPath: 'services/governance/router.js', remotePath: 'services/governance/router.js', category: 'router' },
  { localPath: 'packages/types/index.ts', remotePath: 'packages/types/index.ts', category: 'schema' }
];

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function readSource(file: SourceFile): Promise<string | null> {
  if (REPO) {
    const result = await fetchFile(`${REPO}/${file.remotePath}`);
    if (result.ok) {
      console.log(`[Ingest] pulled remote ${REPO}/${file.remotePath}`);
      return result.content;
    }
    console.warn(`[Ingest] remote pull failed (${result.code}); falling back to local: ${file.localPath}`);
  }
  try {
    const content = await readFile(resolve(ROOT, file.localPath), 'utf8');
    console.log(`[Ingest] read local ${file.localPath}`);
    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Ingest] skipping ${file.localPath}: ${message}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log('[Ingest] Self-Aware Vector Memory Layer — topology ingestion starting');
  if (REPO) console.log(`[Ingest] live remote source: ${REPO}`);
  let stored = 0;

  for (const file of SOURCES) {
    const content = await readSource(file);
    if (!content) continue;
    const chunks = chunkText(content);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] ?? '';
      const embedding = await embedText(chunk);
      const metadata: TopologyMetadata = {
        file_path: file.localPath,
        category: file.category,
        version: VERSION,
        chunk_index: String(i),
        chunk_total: String(chunks.length)
      };
      const result = await storeSystemChunk(chunk, metadata, embedding);
      if (result.ok) stored++;
      else console.warn(`[Ingest] store failed for ${file.localPath}[${i}]: ${result.error}`);
    }
  }

  console.log(`[Ingest] complete — ${stored} topology chunks stored.`);
}

main().catch((err) => {
  console.error('[Ingest] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
