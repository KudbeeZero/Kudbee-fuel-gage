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

export interface OSPluginResult {
  plugin: OSPlugin | null;
  isUnknown: boolean;
}

const registry = new Map<string, OSPlugin>();

export function registerPlugin(plugin: OSPlugin): void {
  if (registry.has(plugin.id)) {
    console.warn(`[PluginRegistry] Overwriting plugin: ${plugin.id}`);
  }
  registry.set(plugin.id, plugin);
}

export function getPlugin(id: string): OSPluginResult {
  const plugin = registry.get(id);
  if (!plugin) {
    console.warn(`[PluginRegistry] Unknown plugin requested: ${id}`);
    return { plugin: null, isUnknown: true };
  }
  return { plugin, isUnknown: false };
}

export function getPluginOrThrow(id: string): OSPlugin {
  const result = getPlugin(id);
  if (result.isUnknown || !result.plugin) {
    throw new Error(`Plugin "${id}" not found in registry`);
  }
  return result.plugin;
}

export function getPluginsByCategory(category: OSPlugin['category']): OSPlugin[] {
  return Array.from(registry.values()).filter((p) => p.category === category);
}

export function getAllPlugins(): OSPlugin[] {
  return Array.from(registry.values());
}

export function hasPlugin(id: string): boolean {
  return registry.has(id);
}
