import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';

interface GovernanceGatePluginProps {
  plugin: IKudbeePlugin;
  pendingApprovals?: number;
  pendingThinkTokens?: number;
}

export function GovernanceGatePlugin({ plugin, pendingApprovals = 0, pendingThinkTokens = 0 }: GovernanceGatePluginProps) {
  const totalPending = pendingApprovals + pendingThinkTokens;
  return (
    <PluginCard plugin={plugin} accent="border-amber-500/20" glow="via-amber-500/50">
      <p>Human-in-the-Loop approval gate — proposed agent actions await human sign-off before execution.</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-amber-300">
        <span className={`h-1.5 w-1.5 rounded-full ${totalPending > 0 ? 'animate-pulse bg-amber-400' : 'bg-amber-400/50'}`} />
        {totalPending > 0
          ? `${totalPending} pending approval${totalPending === 1 ? '' : 's'} · HITL`
          : 'awaiting approval · HITL'}
      </div>
    </PluginCard>
  );
}
