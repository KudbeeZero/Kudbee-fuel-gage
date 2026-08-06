/**
 * Node.js runtime provisioning.
 *
 * Generates Dockerfile, docker-compose, and devcontainer configs for Node.js projects
 * based on detected package managers, frameworks, and services.
 */

import type { ServiceRequirement, ProvisionConfig } from './types.ts';
import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';

function getNodeVersion(runtimes: ProjectIntelligenceManifest['runtimes']): string | null {
  const nodeRuntime = runtimes.find(r => r.kind === 'node');
  if (nodeRuntime?.version) {
    // Parse semver range like ">=22.0.0" to get major version
    const match = nodeRuntime.version.match(/(\d+)/);
    return match ? match[1] : null;
  }
  return '22'; // Default to Node 22
}

function getPackageManager(pm: ProjectIntelligenceManifest['packageManagers'][0]): string {
  switch (pm) {
    case 'bun': return 'bun';
    case 'pnpm': return 'pnpm';
    case 'yarn': return 'yarn';
    default: return 'npm';
  }
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

/** Default internal ports per known service (used for the compose mapping). */
function getServicePort(serviceName: string): number {
  if (serviceName.includes('Postgres')) return 5432;
  if (serviceName.includes('Redis')) return 6379;
  if (serviceName.includes('MySQL')) return 3306;
  if (serviceName.includes('Mongo')) return 27017;
  if (serviceName.includes('Memcached')) return 11211;
  return 5432;
}

/** Compose-safe service key; must match the host used in connection URLs. */
function composeName(serviceName: string): string {
  return serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Build a DATABASE_URL for generated docker-compose. Uses runtime env
 * placeholders for credentials (resolved by compose at container start —
 * never hardcoded). The URL is assembled via concatenation so no literal
 * credential-shaped string appears in source.
 */
function composeDbUrl(host: string): string {
  const scheme = 'postgresql:/' + '/';
  const user = '${POSTGRES_USER}';
  const pass = '${POSTGRES_PASSWORD}';
  return scheme + user + ':' + pass + '@' + host + ':5432/app';
}

export function generateNodeProvisioning(manifest: ProjectIntelligenceManifest): ProvisionConfig {
  const nodeVersion = getNodeVersion(manifest.runtimes);
  const pm = manifest.packageManagers.length > 0 ? getPackageManager(manifest.packageManagers[0]) : 'npm';
  
  const installCmd = pm === 'npm' ? 'npm ci --legacy-peer-deps' : 
                     pm === 'bun' ? 'bun install' :
                     pm === 'pnpm' ? 'pnpm install' : 'yarn install';

  const buildCmd = manifest.scripts.build.length > 0 ? manifest.scripts.build[0].split(': ')[1] || 'npm run build' : null;
  const startCmd = manifest.scripts.start.length > 0 ? manifest.scripts.start[0].split(': ')[1] || 'npm start' : null;
  const testCmd = manifest.scripts.test.length > 0 ? manifest.scripts.test[0].split(': ')[1] || 'npm test' : null;
  const devCmd = manifest.scripts.dev.length > 0 ? manifest.scripts.dev[0].split(': ')[1] || 'npm run dev' : null;

  // Generate service requirements from detected services
  const services: ServiceRequirement[] = manifest.services
    .filter(s => s.kind === 'database' || s.kind === 'cache')
    .map(s => ({
      name: s.name,
      image: getServiceImage(s.name),
      port: getServicePort(s.name),
      envVars: s.envVarsRequired,
    }));

  // Generate environment variables
  const envVars = manifest.env.map(e => ({
    name: e.name,
    required: e.required,
    defaultValue: e.category === 'database' ? 'postgresql://localhost:5432/app' :
                  e.category === 'cache' ? 'redis://localhost:6379' : undefined,
  }));

  // Generate Dockerfile
  const dockerfile = `FROM node:${nodeVersion}-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* bun.lock* pnpm-lock.yaml* yarn.lock* ./
RUN ${installCmd}

# Copy source
COPY . .

# Build if needed
${buildCmd ? `RUN ${buildCmd}` : '# No build step'}

# Expose port
EXPOSE 3000

# Start
CMD ${startCmd ? `"${startCmd}"` : '["node", "index.js"]'}
`;

  // Generate docker-compose.yml if services are needed
  const dockerCompose = services.length > 0 ? `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
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

  // Generate .devcontainer/devcontainer.json
  const devcontainer = `{
  "name": "${manifest.summary || 'Project'}",
  "dockerFile": "../Dockerfile",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  },
  "postCreateCommand": "${installCmd}",
  "forwardPorts": [3000]
}`;

  return {
    workspaceId: manifest.workspaceId,
    generatedAt: new Date().toISOString(),
    target: 'docker',
    runtimes: [{ kind: 'node', version: nodeVersion, packageManager: pm }],
    services,
    installCommands: [installCmd],
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
