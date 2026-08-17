/**
 * Thinkbox Provisioning Panel
 * PR-003: Environment Provisioning
 * Reusable panel for generating and previewing provisioning manifests
 */

import { useState, useEffect, useCallback } from 'react';
import { Code2, Copy, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiPost } from '../lib/apiClient';
import type { ProvisionConfig } from '../services/ingestion/routes/thinkbox';

interface ProvisioningPanelProps {
  workspaceId: string;
  manifest: {
    languages: string[];
    packageManagers: string[];
    services: { kind: string; name: string }[];
    env: { name: string; required: boolean }[];
  };
}

export function ProvisioningPanel({ workspaceId, manifest }: ProvisioningPanelProps) {
  const [loading, setLoading] = useState(false);
  const [provisionConfig, setProvisionConfig] = useState<ProvisionConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<'docker' | 'devcontainer' | 'nix'>('docker');

  const handleProvision = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await apiPost<ProvisionConfig>(`/api/thinkbox/provision/${workspaceId}`, { target });
      setProvisionConfig(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, target]);

  // Auto-run provision on mount if we have enough data
  useEffect(() => {
    if (manifest.languages.length > 0 && manifest.packageManagers.length > 0) {
      handleProvision();
    }
  }, [handleProvision, manifest]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!provisionConfig) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Code2 className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-display text-sm font-semibold text-slate-200">Environment Provisioning</h3>
        </div>
        <div className="text-sm text-slate-500 mb-4">
          Generate Docker, devcontainer, or Nix provisioning manifests for your workspace.
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['docker', 'devcontainer', 'nix'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                target === t
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/40 text-slate-500 border border-slate-700/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={handleProvision}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-mono hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Code2 className="w-4 h-4" />
              Generate Provisioning Manifest
            </>
          )}
        </button>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-display text-sm font-semibold text-slate-200">
            Provisioning Manifest ({target})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(JSON.stringify(provisionConfig, null, 2))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/30 text-slate-400 text-xs font-mono hover:text-slate-300 hover:border-slate-600 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
          <button
            onClick={() => downloadFile(`provisioning-${workspaceId.slice(0, 8)}.json`, JSON.stringify(provisionConfig, null, 2))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto max-h-96 bg-slate-950/60 p-3 rounded-lg border border-slate-800/40">
        {JSON.stringify(provisionConfig, null, 2)}
      </pre>

      {provisionConfig.environmentVariables.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/40">
          <h4 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">Environment Variables</h4>
          <div className="space-y-1">
            {provisionConfig.environmentVariables.map((env, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={`font-mono px-1.5 py-0.5 rounded ${
                  env.required ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {env.name}
                </span>
                <span className="text-slate-600">
                  {env.defaultValue ? `default: ${env.defaultValue}` : 'required'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {provisionConfig.services.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/40">
          <h4 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">Services</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {provisionConfig.services.map((service, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                <span className="text-slate-300">{service.name}</span>
                <span className="text-slate-600">({service.image})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProvisioningPanel;
