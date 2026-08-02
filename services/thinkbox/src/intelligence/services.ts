/**
 * Services detection.
 *
 * Detects databases, caches, AI SDKs, message queues, storage, monitoring,
 * and authentication services from dependency manifests and config files.
 */

import { readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { ServiceInfo } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

interface ServiceDefinition {
  kind: ServiceInfo['kind'];
  name: string;
  sdk: string | null;
  signals: string[];
}

const SERVICE_CATALOG: ServiceDefinition[] = [
  { kind: 'database', name: 'PostgreSQL', sdk: 'pg', signals: ['pg', 'postgres', 'postgresql', 'kysely', 'drizzle-orm', 'prisma', '@prisma/client', 'sequelize', 'typeorm'] },
  { kind: 'database', name: 'Neon', sdk: '@neondatabase/serverless', signals: ['@neondatabase', 'neondatabase', 'neon'] },
  { kind: 'database', name: 'MongoDB', sdk: 'mongodb', signals: ['mongodb', 'mongoose', 'mongosh'] },
  { kind: 'database', name: 'MySQL', sdk: 'mysql2', signals: ['mysql', 'mysql2'] },
  { kind: 'database', name: 'SQLite', sdk: 'better-sqlite3', signals: ['sqlite', 'better-sqlite3', 'sqlite3'] },
  { kind: 'database', name: 'Supabase', sdk: '@supabase/supabase-js', signals: ['@supabase', 'supabase'] },
  { kind: 'database', name: 'Firebase', sdk: 'firebase', signals: ['firebase', 'firestore', '@firebase'] },
  { kind: 'database', name: 'PlanetScale', sdk: '@planetscale/database', signals: ['@planetscale', 'planetscale'] },
  { kind: 'database', name: 'Turso', sdk: '@libsql/client', signals: ['@libsql', 'libsql', 'turso'] },
  { kind: 'database', name: 'Xata', sdk: '@xata.io/client', signals: ['@xata', 'xata'] },
  { kind: 'database', name: 'Convex', sdk: 'convex', signals: ['convex'] },
  { kind: 'cache', name: 'Redis', sdk: 'ioredis', signals: ['redis', 'ioredis', 'upstash-redis', '@upstash/redis', 'node-redis'] },
  { kind: 'cache', name: 'Upstash Redis', sdk: '@upstash/redis', signals: ['@upstash/redis', 'upstash-redis', 'UPSTASH_REDIS'] },
  { kind: 'cache', name: 'Memcached', sdk: 'memcached', signals: ['memcached', 'memcache'] },
  { kind: 'ai', name: 'OpenAI', sdk: 'openai', signals: ['openai', '@openai', 'gpt-4', 'gpt-3', 'whisper', 'dall-e'] },
  { kind: 'ai', name: 'Anthropic', sdk: '@anthropic-ai/sdk', signals: ['@anthropic-ai', 'anthropic', 'claude'] },
  { kind: 'ai', name: 'Groq', sdk: 'groq-sdk', signals: ['groq', 'groq-sdk', 'llama', 'mixtral'] },
  { kind: 'ai', name: 'DeepSeek', sdk: null, signals: ['deepseek', 'deep-seek'] },
  { kind: 'ai', name: 'Google AI', sdk: '@google/generative-ai', signals: ['@google/generative-ai', 'google-ai', 'gemini', 'palm'] },
  { kind: 'ai', name: 'Cohere', sdk: 'cohere-ai', signals: ['cohere'] },
  { kind: 'ai', name: 'HuggingFace', sdk: '@huggingface/inference', signals: ['@huggingface', 'huggingface'] },
  { kind: 'ai', name: 'LangChain', sdk: 'langchain', signals: ['langchain', '@langchain'] },
  { kind: 'ai', name: 'LlamaIndex', sdk: 'llamaindex', signals: ['llamaindex', 'llama-index', 'llama_index'] },
  { kind: 'ai', name: 'Vercel AI SDK', sdk: 'ai', signals: ['@ai-sdk', 'vercel-ai'] },
  { kind: 'ai', name: 'Pinecone', sdk: '@pinecone-database/pinecone', signals: ['@pinecone', 'pinecone'] },
  { kind: 'ai', name: 'Chroma', sdk: 'chromadb', signals: ['chromadb', 'chroma'] },
  { kind: 'ai', name: 'Weaviate', sdk: 'weaviate-client', signals: ['weaviate'] },
  { kind: 'ai', name: 'Qdrant', sdk: '@qdrant/js-client-rest', signals: ['@qdrant', 'qdrant'] },
  { kind: 'queue', name: 'BullMQ', sdk: 'bullmq', signals: ['bullmq', 'bull'] },
  { kind: 'queue', name: 'RabbitMQ', sdk: 'amqplib', signals: ['amqplib', 'rabbitmq', 'amqp'] },
  { kind: 'queue', name: 'Kafka', sdk: 'kafkajs', signals: ['kafka', 'kafkajs'] },
  { kind: 'queue', name: 'SQS', sdk: '@aws-sdk/client-sqs', signals: ['@aws-sdk/client-sqs', 'sqs'] },
  { kind: 'storage', name: 'S3', sdk: '@aws-sdk/client-s3', signals: ['@aws-sdk/client-s3', 's3', 'aws-sdk'] },
  { kind: 'storage', name: 'Cloudinary', sdk: 'cloudinary', signals: ['cloudinary'] },
  { kind: 'storage', name: 'Uploadthing', sdk: 'uploadthing', signals: ['uploadthing'] },
  { kind: 'storage', name: 'Vercel Blob', sdk: '@vercel/blob', signals: ['@vercel/blob'] },
  { kind: 'monitoring', name: 'Sentry', sdk: '@sentry/node', signals: ['@sentry', 'sentry'] },
  { kind: 'monitoring', name: 'Datadog', sdk: 'dd-trace', signals: ['dd-trace', 'datadog'] },
  { kind: 'monitoring', name: 'New Relic', sdk: 'newrelic', signals: ['newrelic', 'new-relic'] },
  { kind: 'monitoring', name: 'Axiom', sdk: '@axiomhq/js', signals: ['@axiom', 'axiom'] },
  { kind: 'monitoring', name: 'Logtail', sdk: '@logtail/node', signals: ['@logtail', 'logtail'] },
  { kind: 'monitoring', name: 'OpenTelemetry', sdk: '@opentelemetry/api', signals: ['@opentelemetry', 'opentelemetry'] },
  { kind: 'auth', name: 'Clerk', sdk: '@clerk/nextjs', signals: ['@clerk', 'clerk'] },
  { kind: 'auth', name: 'Auth0', sdk: '@auth0/nextjs-auth0', signals: ['@auth0', 'auth0'] },
  { kind: 'auth', name: 'NextAuth', sdk: 'next-auth', signals: ['next-auth', 'nextauth'] },
  { kind: 'auth', name: 'Lucia', sdk: 'lucia', signals: ['lucia-auth', 'lucia'] },
  { kind: 'auth', name: 'Better Auth', sdk: 'better-auth', signals: ['better-auth'] },
  { kind: 'auth', name: 'Firebase Auth', sdk: 'firebase/auth', signals: ['firebase/auth', 'firebase-admin'] },
  { kind: 'auth', name: 'Supabase Auth', sdk: '@supabase/ssr', signals: ['@supabase/ssr'] },
  { kind: 'other', name: 'Stripe', sdk: 'stripe', signals: ['stripe', '@stripe'] },
  { kind: 'other', name: 'Resend', sdk: 'resend', signals: ['resend'] },
  { kind: 'other', name: 'SendGrid', sdk: '@sendgrid/mail', signals: ['@sendgrid', 'sendgrid'] },
  { kind: 'other', name: 'Twilio', sdk: 'twilio', signals: ['twilio'] },
  { kind: 'other', name: 'Pusher', sdk: 'pusher', signals: ['pusher'] },
  { kind: 'other', name: 'Ably', sdk: 'ably', signals: ['ably'] },
  { kind: 'other', name: 'tRPC', sdk: '@trpc/server', signals: ['@trpc', 'trpc'] },
  { kind: 'other', name: 'GraphQL', sdk: 'graphql', signals: ['graphql', '@apollo', 'apollo-', 'urql', 'relay'] },
  { kind: 'other', name: 'Prisma', sdk: 'prisma', signals: ['prisma', '@prisma/client'] },
  { kind: 'other', name: 'Drizzle', sdk: 'drizzle-orm', signals: ['drizzle-orm', 'drizzle-kit'] },
  { kind: 'other', name: 'Docker', sdk: null, signals: ['docker'] },
  { kind: 'other', name: 'Kubernetes', sdk: null, signals: ['kubernetes', 'k8s', 'helm'] },
];

function collectDepsFromPackageJson(json: Record<string, unknown>): string[] {
  const deps: string[] = [];
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const obj = json[section];
    if (obj && typeof obj === 'object') {
      deps.push(...Object.keys(obj as Record<string, string>));
    }
  }
  return deps;
}

export function detectServices(files: string[], root: string): ServiceInfo[] {
  const allDeps = new Set<string>();

  for (const f of files) {
    if (basename(f) === 'package.json' && !f.includes('node_modules')) {
      const json = readJsonSafe(join(root, f));
      if (json) {
        for (const dep of collectDepsFromPackageJson(json)) {
          allDeps.add(dep);
        }
      }
    }

    if (basename(f) === 'pyproject.toml') {
      const content = readTextSafe(join(root, f));
      if (content) {
        const requireMatch = content.match(/dependencies\s*=\s*\[([^\]]+)\]/s);
        if (requireMatch) {
          for (const dep of requireMatch[1].split(',')) {
            const name = dep.trim().replace(/["']/g, '').split(' ')[0];
            if (name) allDeps.add(name);
          }
        }
      }
    }
  }

  const found: ServiceInfo[] = [];
  const matched = new Set<string>();

  for (const svc of SERVICE_CATALOG) {
    if (matched.has(svc.name)) continue;

    const evidence: string[] = [];
    for (const sig of svc.signals) {
      const lower = sig.toLowerCase();
      for (const dep of allDeps) {
        if (dep.toLowerCase().includes(lower)) {
          evidence.push(dep);
          matched.add(svc.name);
          break;
        }
      }

      for (const f of files) {
        if (basename(f).toLowerCase().includes(lower)) {
          if (!evidence.includes(f)) evidence.push(f);
          matched.add(svc.name);
        }
      }
    }

    if (evidence.length > 0) {
      const envVars: string[] = [];
      if (svc.kind === 'database') {
        envVars.push(svc.name.includes('Postgres') ? 'DATABASE_URL' :
                      svc.name.includes('Mongo') ? 'MONGODB_URI' :
                      svc.name.includes('Supabase') ? 'SUPABASE_URL' : `${svc.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_URL`);
      }
      if (svc.kind === 'ai') {
        envVars.push(`${svc.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`);
      }
      if (svc.sdk) envVars.push(`${svc.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SDK_KEY`);

      found.push({
        kind: svc.kind,
        name: svc.name,
        sdk: svc.sdk,
        envVarsRequired: envVars,
        evidence: evidence.slice(0, 5),
      });
    }
  }

  return found;
}
