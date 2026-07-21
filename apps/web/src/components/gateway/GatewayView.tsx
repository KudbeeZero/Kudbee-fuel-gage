import React, { memo } from 'react';
import { Network, Key } from 'lucide-react';
import { useKeyManager } from '../../hooks/useKeyManager';
import { useRoutingRules } from '../../hooks/useRoutingRules';
import { ProviderKeyCard } from './ProviderKeyCard';
import { RoutingVisualizer } from './RoutingVisualizer';
import { ProviderStatusGrid } from './ProviderStatusGrid';

interface GatewayViewProps {
  showToast?: (msg: string) => void;
}

export const GatewayView = memo(function GatewayView({ showToast }: GatewayViewProps) {
  const { keys, updateKey, saveKeys } = useKeyManager();
  const { activeRoute, gatewayLogs, executeGatewayRequest } = useRoutingRules();

  const handleSaveKeys = () => {
    if (saveKeys()) {
      showToast?.("API Route Provider configuration saved successfully!");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left Side: Keys Management */}
        <div className="w-full md:w-1/2 flex flex-col space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden flex-grow">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
            
            <div className="flex items-center gap-2 mb-6">
              <Key className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="font-display font-semibold text-slate-200 text-sm">API Route Provider Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Manage secure upstream gateway tokens and telemetry ingestion routing ports.</p>
              </div>
            </div>

            <div className="space-y-4">
              <ProviderKeyCard provider={keys.openai!} onChange={(val) => updateKey('openai', val)} />
              <ProviderKeyCard provider={keys.anthropic!} onChange={(val) => updateKey('anthropic', val)} />
              <ProviderKeyCard provider={keys.gemini!} onChange={(val) => updateKey('gemini', val)} />
              <ProviderKeyCard provider={keys.local!} onChange={(val) => updateKey('local', val)} inputType="number" />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveKeys}
                className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer"
              >
                Save Secure Credentials
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Routing Visualizer */}
        <div className="w-full md:w-1/2 flex flex-col space-y-4">
          <div>
            <h2 className="text-xl font-display font-semibold text-slate-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-blue-400" />
              Routing Gateway (CRIS Engine)
            </h2>
            <p className="text-sm text-slate-400 mt-1">Multi-Region Fallback Proxy & Circuit Breaker Visualizer</p>
          </div>
          
            <RoutingVisualizer 
              activeRoute={activeRoute} 
              gatewayLogs={gatewayLogs} 
              onTestRoute={() => executeGatewayRequest({ model: 'unknown' })} 
            />
        </div>

      </div>

      {/* Phase 21: Multi-Provider Load Balancer status + routing decisions */}
      <ProviderStatusGrid />
    </div>
  );
});
