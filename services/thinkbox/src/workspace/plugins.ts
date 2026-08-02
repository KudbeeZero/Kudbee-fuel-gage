import type { PluginManifest, PluginInstance } from './types.ts';

const plugins = new Map<string, PluginInstance>();

export function registerPlugin(manifest: PluginManifest): PluginInstance {
  const instance: PluginInstance = {
    manifest,
    status: 'installed',
    installedAt: new Date().toISOString(),
    lastError: null,
  };
  plugins.set(manifest.id, instance);
  return instance;
}

export function enablePlugin(id: string): PluginInstance | null {
  const p = plugins.get(id);
  if (!p) return null;
  p.status = 'enabled';
  return p;
}

export function disablePlugin(id: string): PluginInstance | null {
  const p = plugins.get(id);
  if (!p) return null;
  p.status = 'disabled';
  return p;
}

export function unloadPlugin(id: string): void {
  plugins.delete(id);
}

export function getPlugin(id: string): PluginInstance | null {
  return plugins.get(id) ?? null;
}

export function listPlugins(): PluginInstance[] {
  return [...plugins.values()];
}

export function getPluginsByStatus(status: PluginInstance['status']): PluginInstance[] {
  return [...plugins.values()].filter(p => p.status === status);
}

registerPlugin({
  id: 'core-agent-swarm',
  name: 'Agent Swarm',
  version: '1.0.0',
  description: 'Live agent collaboration and status monitoring',
  panels: ['agent-swarm', 'agent-detail'],
  commands: [{ name: '/agents', description: 'List active agents' }, { name: '/agent status <name>', description: 'Agent status' }],
  eventHandlers: ['agent:*', 'workspace:*'],
  providerKinds: [],
  agentExtensions: ['KILOH', 'FORGE', 'DTHINK', 'GATE', 'JOURNAL', 'BUS'],
});

registerPlugin({
  id: 'core-execution-engine',
  name: 'Execution Engine',
  version: '1.0.0',
  description: 'Governed command execution with approval gates',
  panels: ['execution-queue', 'approval-panel'],
  commands: [{ name: '/execute', description: 'Start execution' }, { name: '/pause', description: 'Pause execution' }],
  eventHandlers: ['execution:*', 'healing:*'],
  providerKinds: [],
  agentExtensions: ['FORGE'],
});

registerPlugin({
  id: 'core-timeline',
  name: 'Timeline Engine',
  version: '1.0.0',
  description: 'Replayable event timeline',
  panels: ['timeline-view'],
  commands: [{ name: '/timeline', description: 'Show timeline' }],
  eventHandlers: ['timeline:*', 'workspace:*', 'agent:*'],
  providerKinds: [],
  agentExtensions: [],
});

registerPlugin({
  id: 'core-terminal',
  name: 'Interactive Terminal',
  version: '1.0.0',
  description: 'Live command execution and agent communication',
  panels: ['terminal-panel'],
  commands: [],
  eventHandlers: ['terminal:*'],
  providerKinds: [],
  agentExtensions: [],
});

registerPlugin({
  id: 'core-architecture',
  name: 'Architecture Graph',
  version: '1.0.0',
  description: 'Interactive dependency and architecture visualization',
  panels: ['architecture-graph'],
  commands: [{ name: '/graph', description: 'Show architecture graph' }],
  eventHandlers: ['graph:*'],
  providerKinds: [],
  agentExtensions: [],
});
