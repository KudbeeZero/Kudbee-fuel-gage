import React, { memo } from 'react';
import { Key } from 'lucide-react';
import { ProviderKey } from '../../hooks/useKeyManager';

interface ProviderKeyCardProps {
  provider: ProviderKey;
  onChange: (value: string) => void;
  inputType?: string;
}

export const ProviderKeyCard = memo(function ProviderKeyCard({
  provider,
  onChange,
  inputType = 'password'
}: ProviderKeyCardProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">{provider.name}</label>
        {provider.isConfigured && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400">● Configured</span>
        )}
      </div>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Key className="h-4 w-4 text-slate-500" />
        </div>
        <input
          type={inputType}
          value={provider.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={provider.prefix + "••••••••"}
          className="w-full scroll-mt-28 bg-slate-950/80 border border-slate-800 rounded-lg pl-10 pr-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-700"
        />
      </div>
    </div>
  );
});
