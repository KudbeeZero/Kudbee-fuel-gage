import { getRedisClient } from './redis.js';
import { agentLog } from './agentLogger.js';

const JOB_PREFIX = 'kudbee:jobs:';
const JOB_MAX_RETRIES = 3;
const JOB_BACKOFF_BASE_MS = 1000;

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  retries: number;
  maxRetries: number;
  createdAt: string;
}

export async function enqueueJob(queue: string, type: string, payload: Record<string, unknown>): Promise<string> {
  const id = `${queue}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = { id, type, payload, retries: 0, maxRetries: JOB_MAX_RETRIES, createdAt: new Date().toISOString() };

  try {
    const redis = getRedisClient({ label: 'job-queue' });
    await redis.lpush(JOB_PREFIX + queue, JSON.stringify(job));
    agentLog('job-queue', 'enqueued', 'INFO', { queue, type, jobId: id }, `Job ${id}: ${type}`);
  } catch {
    agentLog('job-queue', 'enqueue-failed', 'ERROR', { queue, type }, 'Redis unavailable');
  }
  return id;
}

export async function dequeueJob(queue: string): Promise<Job | null> {
  try {
    const redis = getRedisClient({ label: 'job-queue' });
    const raw = await redis.rpop(JOB_PREFIX + queue);
    if (!raw) return null;
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

export async function retryJob(queue: string, job: Job): Promise<void> {
  if (job.retries >= job.maxRetries) {
    await enqueueJob(`${queue}:dead`, job.type, job.payload);
    agentLog('job-queue', 'dead-lettered', 'ERROR', { queue, jobId: job.id, retries: job.retries }, `Job ${job.id} moved to dead-letter queue`);
    return;
  }

  const delayMs = JOB_BACKOFF_BASE_MS * Math.pow(2, job.retries) + Math.random() * 500;
  agentLog('job-queue', 'retrying', 'WARN', { queue, jobId: job.id, retry: job.retries + 1, delayMs }, `Retrying job ${job.id} in ${delayMs}ms`);
  await new Promise((r) => setTimeout(r, delayMs));

  job.retries += 1;
  try {
    const redis = getRedisClient({ label: 'job-queue' });
    await redis.lpush(JOB_PREFIX + queue, JSON.stringify(job));
  } catch {
    agentLog('job-queue', 'retry-failed', 'ERROR', { queue, jobId: job.id }, 'Redis unavailable');
  }
}

export async function getQueueLength(queue: string): Promise<number> {
  try {
    const redis = getRedisClient({ label: 'job-queue' });
    return await redis.llen(JOB_PREFIX + queue);
  } catch {
    return 0;
  }
}

export async function getDeadQueueLength(queue: string): Promise<number> {
  try {
    const redis = getRedisClient({ label: 'job-queue' });
    return await redis.llen(JOB_PREFIX + queue + ':dead');
  } catch {
    return 0;
  }
}
