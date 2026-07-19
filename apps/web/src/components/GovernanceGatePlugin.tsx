import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';

interface GovernanceGatePluginProps {
  plugin: IKudbeePlugin;
}

export function GovernanceGatePlugin({ plugin }: GovernanceGatePluginProps) {
  return (
    <PluginCard plugin={plugin} accent="border-amber-500/20" glow="via-amber-500/50">
      <p>Human-in-the-Loop approval gate — proposed agent actions await human sign-off before execution.</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-amber-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        awaiting approval · HITL
      </div>
    </PluginCard>
  );
}
