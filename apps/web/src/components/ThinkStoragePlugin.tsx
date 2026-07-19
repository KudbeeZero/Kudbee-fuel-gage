import { IKudbeePlugin } from '@kudbee/types';
import { PluginCard } from './PluginCard';

interface ThinkStoragePluginProps {
  plugin: IKudbeePlugin;
}

export function ThinkStoragePlugin({ plugin }: ThinkStoragePluginProps) {
  return (
    <PluginCard plugin={plugin} accent="border-sky-500/20" glow="via-sky-500/50">
      <p>Durable memory recall — semantic search over archived traces with similarity-ranked retrieval.</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-sky-300">
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">recall</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-0.5">embed</span>
      </div>
    </PluginCard>
  );
}
