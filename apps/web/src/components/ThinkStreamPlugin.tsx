import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';

interface ThinkStreamPluginProps {
  plugin: IKudbeePlugin;
}

export function ThinkStreamPlugin({ plugin }: ThinkStreamPluginProps) {
  return (
    <PluginCard plugin={plugin} accent="border-violet-500/20" glow="via-violet-500/50">
      <p>Live chain-of-thought stream — surfaces reasoning tokens from the agent shell in real time.</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-violet-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
        streaming · Think: Stream
      </div>
    </PluginCard>
  );
}
