/**
 * services/github/connector.ts
 * ---------------------------------------------------------------------------
 * GitHub Repository Connector
 *
 * Allows agents to dynamically read repository files on demand via the GitHub
 * REST API (Contents API). Resilient-First: a missing PAT, an unreachable
 * GitHub API, or a missing file degrades to a typed error result — it never
 * throws into the caller. A simple in-memory TTL cache (5 min) prevents
 * rate-limiting on duplicate file requests.
 * ---------------------------------------------------------------------------
 */

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  content: string;
  fetchedAt: number;
}

interface ParsedRepoPath {
  owner: string;
  repo: string;
  path: string;
}

export type FetchFileResult =
  | { ok: true; content: string; cached: boolean }
  | { ok: false; error: string; code: 'INVALID_PATH' | 'MISSING_PAT' | 'NOT_FOUND' | 'UPSTREAM' | 'UNKNOWN' };

const fileCache = new Map<string, CacheEntry>();

/**
 * Parses a repoPath of the form "owner/repo/path/to/file.ts".
 * The first two slash-delimited segments are owner + repo; the remainder is
 * the file path.
 */
export function parseRepoPath(repoPath: string): ParsedRepoPath | null {
  const trimmed = repoPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return null;
  const segments = trimmed.split('/');
  if (segments.length < 3) return null;
  const [owner, repo, ...rest] = segments;
  if (!owner || !repo || rest.length === 0) return null;
  return { owner, repo, path: rest.join('/') };
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Fetches the raw string content of a file from a GitHub repository.
 *
 * @param repoPath Path in "owner/repo/path/to/file" form.
 * @returns A typed result; failures are reported, never thrown.
 */
export async function fetchFile(repoPath: string): Promise<FetchFileResult> {
  const parsed = parseRepoPath(repoPath);
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid repoPath. Expected "owner/repo/path/to/file".',
      code: 'INVALID_PATH'
    };
  }

  const cacheKey = `${parsed.owner}/${parsed.repo}/${parsed.path}`;
  const cached = fileCache.get(cacheKey);
  if (cached && isFresh(cached)) {
    return { ok: true, content: cached.content, cached: true };
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return {
      ok: false,
      error: 'GITHUB_PAT is not configured. GitHub file reads are unavailable.',
      code: 'MISSING_PAT'
    };
  }

  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(
    parsed.repo
  )}/contents/${encodeURIComponent(parsed.path)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'kudbee-agent-connector',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (res.status === 404) {
      return { ok: false, error: `File not found: ${cacheKey}`, code: 'NOT_FOUND' };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `GitHub API returned ${res.status} for ${cacheKey}`,
        code: 'UPSTREAM'
      };
    }

    const content = await res.text();
    fileCache.set(cacheKey, { content, fetchedAt: Date.now() });
    return { ok: true, content, cached: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `GitHub fetch failed: ${message}`, code: 'UNKNOWN' };
  }
}
