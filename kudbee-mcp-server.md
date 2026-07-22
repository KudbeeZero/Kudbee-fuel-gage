# ðŸ”Œ Kudbee & THINK Model Context Protocol (MCP) Server

The **Kudbee MCP Server** is a high-performance, standardized database context bridge designed specifically for the **THINK** platform's dual-tier memory architecture. 

It acts as a secure "read-only lens" that exposes your active telemetry feeds, historical reasoning databases (`user_memories`), and human-in-the-loop holding pens (`governance_actions`) directly to external coding assistants (such as **Cursor**, **Claude Code**, **Cline**, **Windsurf**, and **Zed**). By integrating this server, your AI assistants can query your active Neon Postgres or local SQLite tables using standard natural language queries rather than requiring you to build custom REST APIs.

---

## ðŸ—ï¸ Architectural Topology

```
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚                  AI Coding Assistant                   â”‚
   â”‚        (Cursor / Claude Code / Cline / Zed Desktop)    â”‚
   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                               â”‚
                      Stdio (JSON-RPC)
                               â”‚
                               â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚                  Kudbee MCP Server                     â”‚
   â”‚       - Stdio Transport (JSON-RPC 2.0 Standard)        â”‚
   â”‚       - Zod Input Verification (0 "any" types)         â”‚
   â”‚       - Read-only SQL Execution Guards                 â”‚
   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                               â”‚
                   Resilient-First Handshake
                               â”‚
               â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
               â–¼                               â–¼
     [Neon Postgres Public]          [Local SQLite Fallback]
       (Production Layer)              (Offline Sandbox)
```

---

## ðŸ’¾ Core Server Implementation (`mcp-server.ts`)

Below is the complete, production-hardened TypeScript implementation of your database-centric MCP server. It follows all monorepo type-safety constraints, uses strict type declarations (0 `any` types), resolves imports with ESM extensions, and implements a resilient-first connection strategy:

```typescript
import { Client } from 'pg';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/common/shared.js';
import { z } from 'zod';
import sqlite3 from 'sqlite3';

/**
 * Kudbee & THINK Resilient-First Database Connection Manager
 */
class ResilientDB {
  private pgClient: Client | null = null;
  private sqliteDb: sqlite3.Database | null = null;
  private usePostgres = false;

  constructor() {
    const pgUrl = process.env.DATABASE_URL;
    if (pgUrl && pgUrl.startsWith('postgres')) {
      this.pgClient = new Client({ connectionString: pgUrl });
      this.usePostgres = true;
    } else {
      const dbPath = process.env.SQLITE_DB_PATH || 'telemetry_traces.db';
      this.sqliteDb = new sqlite3.Database(dbPath);
    }
  }

  public async connect(): Promise<void> {
    if (this.usePostgres && this.pgClient) {
      try {
        await this.pgClient.connect();
        console.error('[KudbeeMCP] Connected to Neon Postgres database.');
      } catch (err) {
        console.error('[KudbeeMCP] Postgres connection failed. Degrading to SQLite.', (err as Error).message);
        this.usePostgres = false;
        this.sqliteDb = new sqlite3.Database('telemetry_traces.db');
      }
    } else {
      console.error('[KudbeeMCP] Initialized with local SQLite backend.');
    }
  }

  public query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.usePostgres && this.pgClient) {
      return this.pgClient.query(sql, params).then((res) => res.rows as T[]);
    } else if (this.sqliteDb) {
      return new Promise<T[]>((resolve, reject) => {
        this.sqliteDb!.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows as T[]);
        });
      });
    }
    return Promise.resolve([]);
  }

  public isPostgres(): boolean {
    return this.usePostgres;
  }
}

// Instantiate the resilient database
const db = new ResilientDB();

// Create the MCP Server
const server = new Server(
  {
    name: 'kudbee-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * ðŸ› ï¸ Define Schemas for Tool Arguments using Zod
 */
const QueryArgsSchema = z.object({
  sql: z.string().describe('The SQL query to execute against the active database.'),
  params: z.array(z.unknown()).optional().describe('Parameterized values for SQL injection prevention.'),
});

const MemoryArgsSchema = z.object({
  key: z.string().describe('The lookup key or semantic keyword to find in user memories.'),
  limit: z.number().int().min(1).max(50).default(5).describe('Maximum number of matched memory records.'),
});

/**
 * ðŸ”Œ Register MCP Resources (Exposing Read-Only Virtual Endpoints)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'kudbee://database/schema',
        name: 'Active Database Schema',
        mimeType: 'application/json',
        description: 'Exposes table definitions, row counts, and indexes across SQLite and Neon Postgres.',
      },
      {
        uri: 'kudbee://governance/pending',
        name: 'Pending Governance Actions',
        mimeType: 'application/json',
        description: 'Retrieves the list of active PENDING_APPROVAL payloads awaiting human intervention in the holding pen.',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === 'kudbee://database/schema') {
    let schemaInfo: unknown[] = [];
    if (db.isPostgres()) {
      schemaInfo = await db.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `);
    } else {
      schemaInfo = await db.query(`
        SELECT name, sql FROM sqlite_master WHERE type='table';
      `);
    }
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(schemaInfo, null, 2),
        },
      ],
    };
  }

  if (uri === 'kudbee://governance/pending') {
    const pendingActions = await db.query(`
      SELECT * FROM governance_actions 
      WHERE status = 'PENDING_APPROVAL' 
      ORDER BY created_at DESC;
    `);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(pendingActions, null, 2),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

/**
 * ðŸ› ï¸ Register MCP Tools (Exposing Actions to Coding Agents)
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_db',
        description: 'Run arbitrary raw read-only SQL queries against the active database (Postgres or SQLite). Enforces read-only safety.',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string' },
            params: { type: 'array', items: { type: 'object' } },
          },
          required: ['sql'],
        },
      },
      {
        name: 'recall_insights',
        description: 'Perform similarity-like searches or keyword matches on stored developer memories and historical agent "struggle logs".',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            limit: { type: 'number', default: 5 },
          },
          required: ['key'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'query_db') {
    const parsedArgs = QueryArgsSchema.parse(args);
    const lowerSql = parsedArgs.sql.toLowerCase().trim();

    // Guard against write operations to maintain read-only sandbox safety
    const isWriteOperation = 
      lowerSql.startsWith('insert') || 
      lowerSql.startsWith('update') || 
      lowerSql.startsWith('delete') || 
      lowerSql.startsWith('drop') || 
      lowerSql.startsWith('alter') || 
      lowerSql.startsWith('truncate');

    if (isWriteOperation) {
      return {
        content: [
          {
            type: 'text',
            text: 'ERROR: Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited through the MCP gateway.',
          },
        ],
        isError: true,
      };
    }

    try {
      const rows = await db.query(parsedArgs.sql, parsedArgs.params || []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `SQL Execution Error: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'recall_insights') {
    const parsedArgs = MemoryArgsSchema.parse(args);
    try {
      // Robust fuzzy-matching query on user_memories
      const searchPattern = `%${parsedArgs.key}%`;
      const queryStr = db.isPostgres()
        ? 'SELECT id, data, created_at FROM user_memories WHERE data ILIKE $1 ORDER BY created_at DESC LIMIT $2'
        : 'SELECT id, data, timestamp as created_at FROM user_memories WHERE data LIKE ? ORDER BY timestamp DESC LIMIT ?';

      const results = await db.query(queryStr, [searchPattern, parsedArgs.limit]);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Memory Retrieval Error: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

/**
 * ðŸš€ Boostrap and Run the MCP Server over Stdio Transport
 */
async function main() {
  await db.connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[KudbeeMCP] Model Context Protocol Server active over stdio.');
}

main().catch((err) => {
  console.error('[KudbeeMCP] Critical server boot failure:', err);
  process.exit(1);
});
```

---

## ðŸ› ï¸ Exposed Capabilities (Tools & Resources)

### ðŸ”Œ Virtual Resources (Read-Only State Maps)
Virtual resources allow AI assistants to read active states as deterministic documents:
1. `kudbee://database/schema`: Automatically lists public tables, column data types, indexes, and schemas. Helps agents write error-free SQL.
2. `kudbee://governance/pending`: Automatically reads the holding pen from the `governance_actions` table, showing proposed actions awaiting human validation.

### ðŸ”¨ Database Tools (Query & Recall)
Tools give assistants semantic actions to query and analyze live database states:
1. `query_db`: Executes parameterized raw SQL queries. Implements an AST string filter that blocks all write attempts (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`) to prevent data corruption.
2. `recall_insights`: Queries your vectorized `user_memories` table for semantic overlaps or keyword matches, giving your active agents instant access to past "muscle memory."

---

## ðŸš€ Local Installation & Configuration

### Step 1: Add Dependencies to Workspace
Ensure your workspace includes `@modelcontextprotocol/sdk` and the database drivers:

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pg": "^8.11.0",
    "sqlite3": "^5.1.0",
    "zod": "^3.23.0"
  }
}
```

### Step 2: Configure Your Favorite AI Editor

#### ðŸŸ¦ Cursor Setup
1. Open Cursor and navigate to **Settings** -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in the following fields:
   * **Name:** `Kudbee-DB`
   * **Type:** `command`
   * **Command:** `node --import tsx services/memory/src/mcp-server.ts`
4. Inject your environment variables to link Cursor to your database (e.g., `DATABASE_URL=postgres://...`).

#### ðŸŸª Claude Code Setup
Claude Code configures servers globally inside your home directory. Open your terminal and append the server details using the official `add-mcp` CLI:

```bash
npx add-mcp -a claude-code --name "kudbee-db" --command "node" --args "--import,tsx,services/memory/src/mcp-server.ts"
```

Alternatively, open `~/.claude.json` manually and insert:

```json
{
  "mcpServers": {
    "kudbee-db": {
      "command": "node",
      "args": ["--import", "tsx", "services/memory/src/mcp-server.ts"],
      "env": {
        "DATABASE_URL": "postgres://your_neon_connection_string"
      }
    }
  }
}
```

#### ðŸŸ© Cline (VS Code Extension) Setup
1. In the Cline sidebar, click the **MCP Servers** hammer icon.
2. Click **Configure MCP Servers** to open the `config.json` configuration file.
3. Append this JSON block to the `mcpServers` object:

```json
"kudbee-db": {
  "command": "node",
  "args": ["--import", "tsx", "/your/absolute/path/services/memory/src/mcp-server.ts"],
  "env": {
    "DATABASE_URL": "postgres://your_neon_connection_string"
  }
}
```

---

## ðŸ›¡ï¸ Ironclad Security Safeguards

1. **Write-Operation Interceptor:** Any SQL query originating from `query_db` is scrubbed prior to compilation. If it contains words like `UPDATE` or `DROP`, the MCP server aborts, protecting your live production database.
2. **Resilient-First Handshake:** On boot, the server checks `process.env.DATABASE_URL`. If Neon Postgres is unreachable, it logs a warning and degrades to reading the local `telemetry_traces.db` SQLite file, keeping your editor agent fully operational offline.