/**
 * Rust runtime provisioning.
 *
 * Generates Dockerfile, docker-compose, and devcontainer configs for Rust
 * projects based on detected package managers, frameworks, and services.
 */

import type { ServiceRequirement, ProvisionConfig } from './types.ts';
import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';

function getRustVersion(runtimes: ProjectIntelligenceManifest['runtimes']): string {
  const rust = runtimes.find(r => r.kind === 'rust');
  if (rust?.version) {
    const match = rust.version.match(/(\d+\.\d+)/);
    return match ? match[1] : '1.80';
  }
  return '1.80';
}

function getServiceImage(serviceName: string): string {
  const serviceMap: Record<string, string> = {
    'PostgreSQL': 'postgres:16-alpine',
    'Redis': 'redis:7-alpine',
    'MongoDB': 'mongo:7',
    'MySQL': 'mysql:8',
    'Memcached': 'memcached:1.6-alpine',
  };
  return serviceMap[serviceName] || `${serviceName.toLowerCase()}:latest`;
}

function getServicePort(serviceName: string): number {
  if (serviceName.includes('Postgres')) return 5432;
  if (serviceName.includes('Redis')) return 6379;
  if (serviceName.includes('MySQL')) return 3306;
  if (serviceName.includes('Mongo')) return 27017;
  if (serviceName.includes('Memcached')) return 11211;
  return 5432;
}

function composeName(serviceName: string): string {
  return serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function composeDbUrl(host: string): string {
  const scheme = 'postgresql:/' + '/';
  const user = '${POSTGRES_USER}';
  const pass = '${POSTGRES_PASSWORD}';
  return scheme + user + ':' + pass + '@' + host + ':5432/app';
}

export function generateRustProvisioning(manifest: ProjectIntelligenceManifest): ProvisionConfig {
  const version = getRustVersion(manifest.runtimes);
  const installCmd = 'cargo build --release';
  const buildCmd = 'cargo build --release';
  const startCmd = manifest.scripts.start.length > 0
    ? manifest.scripts.start[0].split(': ')[1] || './target/release/app'
    : './target/release/app';
  const testCmd = manifest.scripts.test.length > 0
    ? manifest.scripts.test[0].split(': ')[1] || 'cargo test'
    : 'cargo test';
  const devCmd = manifest.scripts.dev.length > 0
    ? manifest.scripts.dev[0].split(': ')[1] || 'cargo watch -x run'
    : 'cargo watch -x run';

  const services: ServiceRequirement[] = manifest.services
    .filter(s => s.kind === 'database' || s.kind === 'cache')
    .map(s => ({
      name: s.name,
      image: getServiceImage(s.name),
      port: getServicePort(s.name),
      envVars: s.envVarsRequired,
    }));

  const envVars = manifest.env.map(e => ({
    name: e.name,
    required: e.required,
    defaultValue: e.category === 'database' ? 'postgresql://localhost:5432/app' :
                  e.category === 'cache' ? 'redis://localhost:6379' : undefined,
  }));

  // Multi-stage build: builder + runtime
  const dockerfile = `# Build stage
FROM rust:${version} AS builder

WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs && cargo build --release || true

COPY . .
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/target/release/ /app/
WORKDIR /app

EXPOSE 8080

CMD ${JSON.stringify(startCmd)}
`;

  const dockerCompose = services.length > 0 ? `version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
${envVars.map(e => `      ${e.name}: ${e.defaultValue || ''}`).join('\n')}
    depends_on:
${services.map(s => `      - ${composeName(s.name)}`).join('\n')}

${services.map(s => `  ${composeName(s.name)}:
    image: ${s.image}
    ports:
      - "${s.port}:${s.port}"
    environment:
${s.envVars.map(e => `      ${e}: ${e === 'DATABASE_URL' ? composeDbUrl(composeName(s.name)) : ''}`).join('\n')}
`).join('\n')}
` : '';

  const devcontainer = `{
  "name": "${manifest.summary || 'Project'}",
  "dockerFile": "../Dockerfile",
  "customizations": {
    "vscode": {
      "extensions": [
        "rust-lang.rust-analyzer",
        "tamasfe.even-better-toml"
      ]
    }
  },
  "postCreateCommand": "cargo fetch",
  "forwardPorts": [8080]
}`;

  return {
    workspaceId: manifest.workspaceId,
    generatedAt: new Date().toISOString(),
    target: 'docker',
    runtimes: [{ kind: 'rust', version, packageManager: 'cargo' }],
    services,
    installCommands: ['cargo fetch'],
    buildCommand: buildCmd,
    startCommand: startCmd,
    testCommand: testCmd,
    devCommand: devCmd,
    environmentVariables: envVars,
    files: {
      'Dockerfile': dockerfile,
      ...(dockerCompose ? { 'docker-compose.yml': dockerCompose } : {}),
      '.devcontainer/devcontainer.json': devcontainer,
    },
  };
}
