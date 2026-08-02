/** THINKBOX PR-014A — WorkspaceExplorer placeholder */
import { FolderTree } from 'lucide-react';
export function WorkspaceExplorer() {
  return <div className="p-3"><div className="flex items-center gap-2 mb-2"><FolderTree className="w-3.5 h-3.5 text-slate-500" /><h3 className="text-[10px] font-mono text-slate-400 uppercase">Explorer</h3></div><p className="text-[9px] text-slate-600">Source tree, services, deps — coming in PR-014D.</p></div>;
}
