import { Router, type Request, type Response } from "express";
import { getDbPool, isDbHealthy, dbTelemetry } from "../lib/db.js";
import { getRedisClient, redisTelemetry } from "../lib/redis.js";

export interface Counters {
  primaryQueryCount: number;
  fallbackQueryCount: number;
  primaryInsertCount: number;
  fallbackInsertCount: number;
  redisPrimaryCount: number;
  redisFallbackCount: number;
  redisErrorCount: number;
}

export interface SubsystemStatus {
  path: "PRIMARY" | "FALLBACK";
  primary: boolean;
  reason: string | null;
  lastCheck: string;
  counters?: Partial<Counters>;
}

export interface DegradationStatus {
  timestamp: string;
  overall: "HEALTHY" | "DEGRADED" | "CRITICAL";
  subsystems: {
    neon: SubsystemStatus;
    redis: SubsystemStatus;
    pgvector: SubsystemStatus;
  };
  counters: Counters;
}

function checkNeon(): SubsystemStatus {
  const pool = getDbPool();
  const healthy = isDbHealthy();
  return {
    path: healthy ? "PRIMARY" : "FALLBACK",
    primary: healthy,
    reason: healthy ? null : pool ? "Neon pool created but health probe failed — in-memory store active" : "DATABASE_URL unset — in-memory store active",
    lastCheck: new Date().toISOString(),
    counters: {
      primaryQueryCount: dbTelemetry.primaryQueryCount,
      fallbackQueryCount: dbTelemetry.fallbackQueryCount,
      primaryInsertCount: dbTelemetry.primaryInsertCount,
      fallbackInsertCount: dbTelemetry.fallbackInsertCount
    }
  };
}

function checkRedis(): SubsystemStatus {
  try {
    const client = getRedisClient();
    if (!client) {
      return {
        path: "FALLBACK",
        primary: false,
        reason: "Redis client not initialized (REDIS_URL likely unset)",
        lastCheck: new Date().toISOString(),
        counters: {
          redisPrimaryCount: redisTelemetry.primaryCount,
          redisFallbackCount: redisTelemetry.fallbackCount,
          redisErrorCount: redisTelemetry.errorCount
        }
      };
    }
    const status = client.status || 'unknown';
    const primary = status === 'ready' || status === 'connect';
    return {
      path: primary ? "PRIMARY" : "FALLBACK",
      primary,
      reason: primary ? null : `Redis client status: ${status}`,
      lastCheck: new Date().toISOString(),
      counters: {
        redisPrimaryCount: redisTelemetry.primaryCount,
        redisFallbackCount: redisTelemetry.fallbackCount,
        redisErrorCount: redisTelemetry.errorCount
      }
    };
  } catch (err) {
    return {
      path: "FALLBACK",
      primary: false,
      reason: `Redis check failed: ${err instanceof Error ? err.message : String(err)}`,
      lastCheck: new Date().toISOString(),
      counters: {
        redisPrimaryCount: redisTelemetry.primaryCount,
        redisFallbackCount: redisTelemetry.fallbackCount,
        redisErrorCount: redisTelemetry.errorCount
      }
    };
  }
}

function checkPgvector(): SubsystemStatus {
  const neon = checkNeon();
  if (!neon.primary) {
    return {
      path: "FALLBACK",
      primary: false,
      reason: "pgvector extension unavailable because Neon connection is degraded — vector ops fall back to in-memory similarity",
      lastCheck: new Date().toISOString()
    };
  }
  return {
    path: "PRIMARY",
    primary: true,
    reason: null,
    lastCheck: new Date().toISOString()
  };
}

export function getDegradationStatus(): DegradationStatus {
  const neon = checkNeon();
  const redis = checkRedis();
  const pgvector = checkPgvector();

  const allPrimary = neon.primary && redis.primary && pgvector.primary;
  const anyPrimary = neon.primary || redis.primary || pgvector.primary;

  let overall: DegradationStatus["overall"] = "HEALTHY";
  if (!allPrimary && anyPrimary) {
    overall = "DEGRADED";
  } else if (!anyPrimary) {
    overall = "CRITICAL";
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    subsystems: { neon, redis, pgvector },
    counters: {
      primaryQueryCount: dbTelemetry.primaryQueryCount,
      fallbackQueryCount: dbTelemetry.fallbackQueryCount,
      primaryInsertCount: dbTelemetry.primaryInsertCount,
      fallbackInsertCount: dbTelemetry.fallbackInsertCount,
      redisPrimaryCount: redisTelemetry.primaryCount,
      redisFallbackCount: redisTelemetry.fallbackCount,
      redisErrorCount: redisTelemetry.errorCount
    }
  };
}

export function createDegradationRouter() {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const status = getDegradationStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
