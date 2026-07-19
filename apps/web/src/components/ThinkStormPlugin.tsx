import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';

interface ThinkStormPluginProps {
  plugin: IKudbeePlugin;
}

export function ThinkStormPlugin({ plugin }: ThinkStormPluginProps) {
  return (
    <PluginCard plugin={plugin} accent="border-cyan-500/20" glow="via-cyan-500/50">
      <p>Distributed reasoning storm — fans a task across parallel agent workers and merges the surviving hypotheses.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['fan-out', 'merge', 'survivor'].map((tag) => (
          <span key={tag} className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
            {tag}
          </span>
        ))}
      </div>
    </PluginCard>
  );
}
