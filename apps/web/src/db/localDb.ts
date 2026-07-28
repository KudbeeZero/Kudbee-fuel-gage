import Dexie, { type Table } from 'dexie';

export interface TelemetryRecord {
  id?: number;
  traceId: string;
  model: string;
  tokens: number;
  cost: number;
  status: string;
  timestamp: string;
  cachedAt: number;
}

export interface AgentRecord {
  id?: number;
  agentId: string;
  category: string;
  schedule: string;
  status: string;
  lastAction: string | null;
  recallCount: number;
  decisions: number;
  updatedAt: number;
}

export interface GovernanceRecord {
  id?: number;
  actionId: string;
  agentId: string;
  signature: string;
  valueScore: number;
  status: string;
  timestamp: string;
  cachedAt: number;
}

export interface ThinkTokenRecord {
  id?: number;
  tokenId: string;
  traceId: string;
  taskContext: string;
  status: string;
  kd: number;
  efficacy: number;
  embeddingDim: number;
  timestamp: string;
  cachedAt: number;
}

export interface SyncQueueEntry {
  id?: number;
  tableName: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastAttempt: number | null;
  lastError: string | null;
}

export class KudbeeLocalDB extends Dexie {
  telemetry!: Table<TelemetryRecord, number>;
  agents!: Table<AgentRecord, number>;
  governance!: Table<GovernanceRecord, number>;
  thinkTokens!: Table<ThinkTokenRecord, number>;
  syncQueue!: Table<SyncQueueEntry, number>;

  constructor() {
    super('kudbee_local');
    this.version(1).stores({
      telemetry: '++id, traceId, timestamp, status',
      agents: '++id, agentId, status, updatedAt',
      governance: '++id, actionId, timestamp, status',
      thinkTokens: '++id, tokenId, traceId, status',
      syncQueue: '++id, tableName, operation, createdAt',
    });
  }
}

let dbInstance: KudbeeLocalDB | null = null;

export function getLocalDb(): KudbeeLocalDB {
  if (!dbInstance) {
    dbInstance = new KudbeeLocalDB();
  }
  return dbInstance;
}

export function getSyncCount(): Promise<number> {
  return getLocalDb().syncQueue.count();
}
