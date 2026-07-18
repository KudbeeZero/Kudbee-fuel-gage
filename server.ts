import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";

// --- 1. LOCAL TELEMETRY ENGINE TYPE DEFINITIONS ---

interface User {
  id: number;
  email: string;
  tier: string;
  created_at: string;
}

interface TokenLog {
  id: number;
  user_id: number;
  provider: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  calculated_cost: number;
  project_name?: string;
  timestamp: string;
}

interface QuotaTracker {
  id: number;
  user_id: number;
  provider: string;
  total_allowance: number;
  used_allowance: number;
  reset_timestamp: string;
}

interface TelemetryDatabase {
  users: Record<number, User>;
  token_logs: TokenLog[];
  quota_trackers: Record<string, QuotaTracker>; // Key form: `${user_id}-${provider}`
  next_log_id: number;
}

const DB_FILE = path.join(process.cwd(), "kudbee_telemetry_db.json");

// --- 2. COST CALCULATION ENGINE ---

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "deepseek-r1": { input: 0.00055, output: 0.00219 },
  "deepseek-v3": { input: 0.00014, output: 0.00028 },
};

function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_COSTS[modelName.toLowerCase()] || MODEL_COSTS["claude-3-5-sonnet"];
  return (inputTokens / 1000.0) * rates.input + (outputTokens / 1000.0) * rates.output;
}

// Helper to load / save persistent DB state
async function loadDb(): Promise<TelemetryDatabase> {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    const initialDb: TelemetryDatabase = {
      users: {
        1: { id: 1, email: "dev@kudbee.local", tier: "Pro", created_at: new Date().toISOString() }
      },
      quota_trackers: {
        "1-Anthropic": {
          id: 1,
          user_id: 1,
          provider: "Anthropic",
          total_allowance: 500000,
          used_allowance: 200000,
          reset_timestamp: new Date(Date.now() + 5 * 3600 * 1000).toISOString()
        },
        "1-Cursor": {
          id: 2,
          user_id: 1,
          provider: "Cursor",
          total_allowance: 500,
          used_allowance: 175,
          reset_timestamp: new Date(Date.now() + 3 * 3600 * 1000).toISOString()
        },
        "1-Google": {
          id: 3,
          user_id: 1,
          provider: "Google",
          total_allowance: 1000000,
          used_allowance: 150000,
          reset_timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString()
        },
        "1-DeepSeek": {
          id: 4,
          user_id: 1,
          provider: "DeepSeek",
          total_allowance: 2000000,
          used_allowance: 450000,
          reset_timestamp: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        }
      },
      token_logs: [],
      next_log_id: 1
    };
    await saveDb(initialDb);
    return initialDb;
  }
}

async function saveDb(db: TelemetryDatabase): Promise<void> {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// Add logs helper (to keep code modular and support daemon logging easily)
async function dbAddLog(logIn: {
  user_id: number;
  provider: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  project_name?: string;
}): Promise<TokenLog> {
  const db = await loadDb();
  const cost = calculateCost(logIn.model_name, logIn.input_tokens, logIn.output_tokens);
  
  const newLog: TokenLog = {
    id: db.next_log_id++,
    user_id: logIn.user_id,
    provider: logIn.provider,
    model_name: logIn.model_name,
    input_tokens: logIn.input_tokens,
    output_tokens: logIn.output_tokens,
    calculated_cost: Number(cost.toFixed(6)),
    project_name: logIn.project_name || "kilo-fuel-gauge",
    timestamp: new Date().toISOString()
  };
  
  db.token_logs.push(newLog);
  
  // Update quota tracker
  const quotaKey = `${logIn.user_id}-${logIn.provider}`;
  if (db.quota_trackers[quotaKey]) {
    const quota = db.quota_trackers[quotaKey];
    if (quota.provider === "Cursor") {
      quota.used_allowance += 1;
    } else {
      quota.used_allowance += (logIn.input_tokens + logIn.output_tokens);
    }
  } else {
    // Dynamically insert missing quota targets
    db.quota_trackers[quotaKey] = {
      id: Object.keys(db.quota_trackers).length + 1,
      user_id: logIn.user_id,
      provider: logIn.provider,
      total_allowance: logIn.provider === "Cursor" ? 500 : 1000000,
      used_allowance: logIn.provider === "Cursor" ? 1 : (logIn.input_tokens + logIn.output_tokens),
      reset_timestamp: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    };
  }
  
  await saveDb(db);
  return newLog;
}

// --- 3. BACKGROUND TELEMETRY DAEMON SIMULATOR ---

function startDaemon() {
  console.log("[Daemon] Launching native Node.js telemetry pipeline simulator...");
  const models = [
    { provider: "Anthropic", model_name: "claude-3-5-sonnet" },
    { provider: "DeepSeek", model_name: "deepseek-r1" },
    { provider: "Google", model_name: "gemini-1.5-pro" },
    { provider: "Cursor", model_name: "gpt-4o" }
  ];
  
  const projects = ["kilo-fuel-gauge", "frontier-core", "mesh-globe-3d"];
  
  setInterval(async () => {
    try {
      const selectedModel = models[Math.floor(Math.random() * models.length)];
      const selectedProject = projects[Math.floor(Math.random() * projects.length)];
      
      const logged = await dbAddLog({
        user_id: 1,
        provider: selectedModel.provider,
        model_name: selectedModel.model_name,
        input_tokens: Math.floor(Math.random() * 450) + 50,
        output_tokens: Math.floor(Math.random() * 150) + 15,
        project_name: selectedProject
      });
      
      console.log(`[Daemon] Logged ${logged.model_name} | Cost: $${logged.calculated_cost.toFixed(6)} | Tokens: ${logged.input_tokens} / ${logged.output_tokens}`);
    } catch (err: any) {
      console.warn("[Daemon] Intermittent pipeline simulation log delay:", err.message);
    }
  }, 4000); // Send log stream telemetry every 4 seconds
}

// --- 4. EXPRESS CORE ROUTER AND CORE SERVICES ---

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON body parser for incoming payloads
  app.use(express.json());

  // Log incoming HTTP requests
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
  });

  // API Route: Ingest incoming single OTel log trace
  app.post("/api/telemetry/log", async (req, res) => {
    try {
      const { user_id, provider, model_name, input_tokens, output_tokens, project_name } = req.body;
      
      if (!user_id || !provider || !model_name || input_tokens === undefined || output_tokens === undefined) {
        return res.status(400).json({ error: "Missing required telemetry fields" });
      }

      const log = await dbAddLog({
        user_id: Number(user_id) || 1,
        provider,
        model_name,
        input_tokens: Number(input_tokens) || 0,
        output_tokens: Number(output_tokens) || 0,
        project_name
      });
      
      return res.json(log);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Query historical logged executions
  app.get("/api/telemetry/logs", async (req, res) => {
    try {
      const userId = Number(req.query.user_id) || 1;
      const limit = Number(req.query.limit) || 100;
      
      const db = await loadDb();
      
      const logs = db.token_logs
        .filter(l => l.user_id === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
        
      return res.json(logs);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Query consolidated dashboard aggregate statistics
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      const userId = Number(req.query.user_id) || 1;
      const db = await loadDb();
      
      const now = Date.now();
      const last24h = now - 24 * 3600 * 1000;
      
      const logs24h = db.token_logs.filter(l => l.user_id === userId && new Date(l.timestamp).getTime() >= last24h);
      const totalCost24h = logs24h.reduce((sum, l) => sum + l.calculated_cost, 0);
      
      const allLogs = db.token_logs.filter(l => l.user_id === userId);
      const totalInput = allLogs.reduce((sum, l) => sum + l.input_tokens, 0);
      const totalOutput = allLogs.reduce((sum, l) => sum + l.output_tokens, 0);
      
      const activeModelsSet = new Set(logs24h.map(l => l.model_name));
      
      // Map Quota Trackers with auto-rolling reset logic
      const providers = ["Anthropic", "Cursor", "Google", "DeepSeek"];
      const healthMatrix = [];
      
      for (const provider of providers) {
        const quotaKey = `${userId}-${provider}`;
        let q = db.quota_trackers[quotaKey];
        
        if (!q) {
          // Default placeholder allowances
          q = {
            id: Object.keys(db.quota_trackers).length + 1,
            user_id: userId,
            provider,
            total_allowance: provider === "Cursor" ? 500 : provider === "DeepSeek" ? 2000000 : provider === "Google" ? 1000000 : 500000,
            used_allowance: 0,
            reset_timestamp: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
          };
          db.quota_trackers[quotaKey] = q;
        }
        
        // Auto rolling Quota reset evaluation
        const resetTime = new Date(q.reset_timestamp).getTime();
        if (resetTime <= now) {
          q.used_allowance = 0;
          q.reset_timestamp = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
        
        const remaining = Math.max(0, q.total_allowance - q.used_allowance);
        const percentage = q.total_allowance > 0 ? Math.round((remaining / q.total_allowance) * 100) : 0;
        const secondsLeft = Math.max(0, Math.round((new Date(q.reset_timestamp).getTime() - now) / 1000));
        
        healthMatrix.push({
          provider: q.provider,
          total_allowance: q.total_allowance,
          used_allowance: q.used_allowance,
          remaining,
          percentage_remaining: percentage,
          seconds_until_reset: secondsLeft
        });
      }
      
      // Update DB with auto-reset quota statuses
      await saveDb(db);
      
      return res.json({
        total_24h_cost: Number(totalCost24h.toFixed(6)),
        total_historical_tokens: totalInput + totalOutput,
        total_active_models: activeModelsSet.size || 4,
        health_matrix: healthMatrix
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Ingest a batch of logs parsed from CSV
  app.post("/api/telemetry/inject-csv", async (req, res) => {
    try {
      const { logs } = req.body;
      if (!logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: "Missing logs array" });
      }

      const db = await loadDb();
      const inserted = [];

      for (const item of logs) {
        const provider = item.provider || "Anthropic";
        const model_name = item.model_name || item.model || "claude-3-5-sonnet";
        const input_tokens = Number(item.input_tokens) || Number(item.tokens_in) || 0;
        const output_tokens = Number(item.output_tokens) || Number(item.tokens_out) || 0;
        const project_name = item.project_name || item.project || "offline-csv-import";
        const timestamp = item.timestamp || new Date().toISOString();

        const cost = calculateCost(model_name, input_tokens, output_tokens);

        const newLog: TokenLog = {
          id: db.next_log_id++,
          user_id: 1,
          provider,
          model_name,
          input_tokens,
          output_tokens,
          calculated_cost: Number(cost.toFixed(6)),
          project_name,
          timestamp
        };

        db.token_logs.push(newLog);

        // Update quota tracker
        const quotaKey = `1-${provider}`;
        if (db.quota_trackers[quotaKey]) {
          const quota = db.quota_trackers[quotaKey];
          if (quota.provider === "Cursor") {
            quota.used_allowance += 1;
          } else {
            quota.used_allowance += (input_tokens + output_tokens);
          }
        }
        inserted.push(newLog);
      }

      await saveDb(db);
      return res.json({ success: true, count: inserted.length, logs: inserted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Reset / Purge DB caches (Danger Zone)
  app.post("/api/telemetry/purge", async (req, res) => {
    try {
      const userId = Number(req.query.user_id) || 1;
      const db = await loadDb();
      
      // Clear logs and reset allowances
      db.token_logs = db.token_logs.filter(l => l.user_id !== userId);
      for (const key in db.quota_trackers) {
        if (db.quota_trackers[key].user_id === userId) {
          db.quota_trackers[key].used_allowance = 0;
        }
      }
      
      await saveDb(db);
      return res.json({ status: "success", message: "Telemetry logs have been purged and database reset." });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite development server / production static asset setup
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Registering Vite development middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Standalone production build detected. Mounting /dist folder...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind server listener to port 3000
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Core router active and listening on http://localhost:${PORT}`);
    
    // Seed and spawn simulation daemon
    startDaemon();
  });
}

startServer().catch((err) => {
  console.error("[Server] Fatal bootstrap exception:", err);
});
