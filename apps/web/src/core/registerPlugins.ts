import { registerPlugin, type OSPlugin } from '../core/pluginRegistry';

async function safeRegisterPlugin(pluginPromise: Promise<{ default: OSPlugin }>, fallbackId: string) {
  try {
    const mod = await pluginPromise.catch((err) => {
      console.warn(`[PluginRegistry] Failed to load plugin ${fallbackId}:`, err instanceof Error ? err.message : String(err));
      return null;
    });
    if (mod?.default) registerPlugin(mod.default);
  } catch (err) {
    console.warn(`[PluginRegistry] Error registering plugin ${fallbackId}:`, err instanceof Error ? err.message : String(err));
  }
}

safeRegisterPlugin(import('../plugins/AgenticRag'), 'agentic-rag');
safeRegisterPlugin(import('../plugins/VectorStore'), 'vector-store');
safeRegisterPlugin(import('../plugins/LiveTelemetry'), 'live-telemetry');
safeRegisterPlugin(import('../plugins/CommunityLedger'), 'community-ledger');
