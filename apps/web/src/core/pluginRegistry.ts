import type { ComponentType } from 'react';

export interface OSPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'core' | 'memory' | 'telemetry' | 'ledger';
  component: ComponentType<Record<string, unknown>>;
  defaultRoute?: string;
}

const registry = new Map<string, OSPlugin>();

export function registerPlugin(plugin: OSPlugin): void {
  if (registry.has(plugin.id)) {
    console.warn(`[PluginRegistry] Overwriting plugin: ${plugin.id}`);
  }
  registry.set(plugin.id, plugin);
}

export function getPlugin(id: string): OSPlugin | undefined {
  return registry.get(id);
}

export function getPluginsByCategory(category: OSPlugin['category']): OSPlugin[] {
  return Array.from(registry.values()).filter((p) => p.category === category);
}

export function getAllPlugins(): OSPlugin[] {
  return Array.from(registry.values());
}
