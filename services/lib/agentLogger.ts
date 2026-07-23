import { getRedisClient } from './redis.js';

const AGENT_LOG_CHANNEL = 'kudbee:agent:logs';
const AGENT_LOG_KEY = 'kudbee:agent:log:stream';
const AGENT_LOG_MAX = 200;

export interface AgentLogEntry {
  ts: string;
  agent: string;
  event: string;
  status: 'INFO' | 'WARN' | 'ERROR' | 'PROCESSING' | 'CIRCUIT_OPEN';
  data?: Record<string, unknown>;
  message?: string;
}

export function agentLog(agent: string, event: string, status: AgentLogEntry['status'], data?: Record<string, unknown>, message?: string) {
  const entry: AgentLogEntry = {
    ts: new Date().toISOString(),
    agent,
    event,
    status,
    ...(data ? { data } : {}),
    ...(message ? { message } : {})
  };

  const json = JSON.stringify(entry);
  console.log(`[${agent}] ${status} ${event}${message ? ': ' + message : ''}`);

  try {
    const redis = getRedisClient({ label: 'agent-log' });
    redis.lpush(AGENT_LOG_KEY, JSON.stringify(entry)).catch(() => {});
    redis.ltrim(AGENT_LOG_KEY, 0, AGENT_LOG_MAX - 1).catch(() => {});
    redis.publish(AGENT_LOG_CHANNEL, JSON.stringify({ type: 'agent_log', data: entry })).catch(() => {});
  } catch {
    /* Redis unavailable — log is best-effort */
  }
}

export function broadcastAgentState(agent: string, state: Record<string, unknown>) {
  try {
    const redis = getRedisClient({ label: 'agent-state' });
    redis.set(`kudbee:agent:state:${agent}`, JSON.stringify(state), 'EX', 30).catch(() => {});
    redis.publish('kudbee:events', JSON.stringify({
      type: 'agent_state',
      data: { agent, ...state, ts: new Date().toISOString() }
    })).catch(() => {});
  } catch {
    /* best-effort broadcast */
  }
}
