/**
 * Python runtime provisioning.
 *
 * Generates Dockerfile, docker-compose, and devcontainer configs for Python
 * projects based on detected package managers, frameworks, and services.
 */

import type { ServiceRequirement, ProvisionConfig } from './types.ts';
import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';

function getPythonVersion(runtimes: ProjectIntelligenceManifest['runtimes']): string {
  const py = runtimes.find(r => r.kind === 'python');
  if (py?.version) {
    const match = py.version.match(/(\d+\.\d+)/);
    return match ? match[1] : '3.12';
  }
  return '3.12';
}

function getPackageManager(pm: ProjectIntelligenceManifest['packageManagers'][0]): string {
  if (pm === 'pip' || pm === 'poetry' || pm === 'bundler') return pm;
  return 'pip';
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

export function generatePythonProvisioning(manifest: ProjectIntelligenceManifest): ProvisionConfig {
  const version = getPythonVersion(manifest.runtimes);
  const pm = manifest.packageManagers.length > 0 ? getPackageManager(manifest.packageManagers[0]) : 'pip';

  const installCmd = pm === 'pip' ? 'pip install -r requirements.txt'
    : pm === 'poetry' ? 'poetry install'
    : 'uv pip install -r requirements.txt';

  const buildCmd = manifest.scripts.build.length > 0 ? manifest.scripts.build[0].split(': ')[1] || null : null;
  const startCmd = manifest.scripts.start.length > 0 ? manifest.scripts.start[0].split(': ')[1] || 'python app.py' : 'python app.py';
  const testCmd = manifest.scripts.test.length > 0 ? manifest.scripts.test[0].split(': ')[1] || 'pytest' : 'pytest';
  const devCmd = manifest.scripts.dev.length > 0 ? manifest.scripts.dev[0].split(': ')[1] || null : null;

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

  const dockerfile = `FROM python:${version}-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt* pyproject.toml poetry.lock* uv.lock* ./
RUN ${installCmd}

# Copy source
COPY . .

# Build if needed
${buildCmd ? `RUN ${buildCmd}` : '# No build step'}

# Expose port
EXPOSE 8000

# Start
CMD ${JSON.stringify(startCmd)}
`;

  const dockerCompose = services.length > 0 ? `version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
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
        "ms-python.python",
        "ms-python.vscode-pylance"
      ]
    }
  },
  "postCreateCommand": "${installCmd}",
  "forwardPorts": [8000]
}`;

  return {
    workspaceId: manifest.workspaceId,
    generatedAt: new Date().toISOString(),
    target: 'docker',
    runtimes: [{ kind: 'python', version, packageManager: pm }],
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
