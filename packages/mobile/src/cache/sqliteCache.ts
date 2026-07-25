interface CacheEntry {
  key: string;
  value: unknown;
  expiresAt: number | null;
}

interface DbSchema {
  entries: Map<string, CacheEntry>;
  dirty: boolean;
}

const memoryStore: DbSchema = {
  entries: new Map(),
  dirty: false
};

let sqliteAvailable: boolean | null = null;

async function checkSqliteAvailability(): Promise<boolean> {
  if (sqliteAvailable !== null) return sqliteAvailable;
  try {
    const module = await import('bun:sqlite');
    const db = new module.Database(':memory:');
    db.run('CREATE TABLE IF NOT EXISTS _probe (id INTEGER PRIMARY KEY)');
    db.run('INSERT INTO _probe VALUES (1)');
    db.run('DROP TABLE _probe');
    db.close();
    sqliteAvailable = true;
    return true;
  } catch {
    sqliteAvailable = false;
    return false;
  }
}

function getDatabase(): { run: (_sql: string) => void; query: (_sql: string) => unknown[]; close: () => void } | null {
  return null;
}

async function ensureSchema(): Promise<void> {
  const available = await checkSqliteAvailability();
  if (!available) return;

  try {
    const { Database } = await import('bun:sqlite');
    const db = new Database(':memory:');
    db.run(
      'CREATE TABLE IF NOT EXISTS kudbee_cache (' +
      '  key TEXT PRIMARY KEY,' +
      '  value TEXT NOT NULL,' +
      '  expires_at INTEGER' +
      ')'
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_cache_expires ON kudbee_cache(expires_at)');
    db.close();
  } catch {
    /* sqlite unavailable — unmanaged fallback */
  }
}

function setMemoryEntry(key: string, value: unknown, ttlMs?: number): void {
  const entry: CacheEntry = {
    key,
    value,
    expiresAt: ttlMs ? Date.now() + ttlMs : null
  };
  memoryStore.entries.set(key, entry);
  memoryStore.dirty = true;
}

function getMemoryEntry<T = unknown>(key: string): T | null {
  const entry = memoryStore.entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    memoryStore.entries.delete(key);
    return null;
  }
  return entry.value as T;
}

function deleteMemoryEntry(key: string): void {
  memoryStore.entries.delete(key);
}

function clearMemoryEntries(): void {
  memoryStore.entries.clear();
}

export interface SqliteCacheOptions {
  dbPath?: string;
  defaultTTLMs?: number;
}

export class SqliteCache {
  private ttlMs: number;
  private initialized: boolean;

  constructor(options: SqliteCacheOptions = {}) {
    this.ttlMs = options.defaultTTLMs ?? 300_000;
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await ensureSchema();
    this.initialized = true;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.init();
    const available = await checkSqliteAvailability();

    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        const row = db.query('SELECT value, expires_at FROM kudbee_cache WHERE key = ?').get(key) as { value: string; expires_at: number | null } | undefined;
        db.close();
        if (!row) return null;
        if (row.expires_at !== null && Date.now() > row.expires_at) {
          await this.delete(key);
          return null;
        }
        try {
          return JSON.parse(row.value) as T;
        } catch {
          return null;
        }
      } catch {
        return getMemoryEntry<T>(key);
      }
    }

    return getMemoryEntry<T>(key);
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    await this.init();
    const effectiveTTL = ttlMs ?? this.ttlMs;
    const serialized = JSON.stringify(value);

    const available = await checkSqliteAvailability();
    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        const expiresAt = Date.now() + effectiveTTL;
        db.run(
          'INSERT OR REPLACE INTO kudbee_cache (key, value, expires_at) VALUES (?, ?, ?)',
          [key, serialized, expiresAt]
        );
        db.close();
        return;
      } catch {
        /* fall through to memory */
      }
    }

    setMemoryEntry(key, value, effectiveTTL);
  }

  async delete(key: string): Promise<void> {
    await this.init();
    const available = await checkSqliteAvailability();
    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        db.run('DELETE FROM kudbee_cache WHERE key = ?', [key]);
        db.close();
        return;
      } catch {
        /* fall through to memory */
      }
    }
    deleteMemoryEntry(key);
  }

  async clear(): Promise<void> {
    await this.init();
    const available = await checkSqliteAvailability();
    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        db.run('DELETE FROM kudbee_cache');
        db.close();
        return;
      } catch {
        /* fall through to memory */
      }
    }
    clearMemoryEntries();
  }

  async keys(): Promise<string[]> {
    await this.init();
    const available = await checkSqliteAvailability();
    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        const rows = db.query('SELECT key FROM kudbee_cache ORDER BY key').all() as { key: string }[];
        db.close();
        return rows.map((r) => r.key);
      } catch {
        return Array.from(memoryStore.entries.keys());
      }
    }
    return Array.from(memoryStore.entries.keys());
  }

  async size(): Promise<number> {
    await this.init();
    const available = await checkSqliteAvailability();
    if (available) {
      try {
        const { Database } = await import('bun:sqlite');
        const db = new Database(':memory:');
        const row = db.query('SELECT COUNT(*) as count FROM kudbee_cache').get() as { count: number };
        db.close();
        return row.count;
      } catch {
        return memoryStore.entries.size;
      }
    }
    return memoryStore.entries.size;
  }

  get memoryStore(): Map<string, CacheEntry> {
    return memoryStore.entries;
  }
}

export const defaultCache = new SqliteCache({ defaultTTLMs: 300_000 });
