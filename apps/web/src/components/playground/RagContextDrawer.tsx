import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileSearch, Loader2, Server, ChevronRight, Database } from 'lucide-react';
import type { RetrievedChunk, VectorSyncStatus } from '../../hooks/useVectorSync';

interface RagContextDrawerProps {
  open: boolean;
  onClose: () => void;
  chunks: RetrievedChunk[];
  recalling: boolean;
  recallError: string | null;
  syncStatus: VectorSyncStatus;
  prompt: string;
}

export function RagContextDrawer({
  open,
  onClose,
  chunks,
  recalling,
  recallError,
  syncStatus,
  prompt
}: RagContextDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="rag-context-drawer"
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950/95 shadow-[0_0_48px_rgba(0,0,0,0.6)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-sm font-semibold text-slate-200">RAG Context</h2>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                  {syncStatus.state}
                </span>
              </div>
              <button
                id="rag-drawer-close"
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-800 bg-slate-900/60 p-1.5 text-slate-400 hover:text-slate-200"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <section
                id="rag-drawer-vector-status"
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"
              >
                <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                  <Server className="h-3 w-3" />
                  Vector Store
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <div>
                    <div className="text-slate-500">Chunks</div>
                    <div className="font-bold text-cyan-300">{syncStatus.totalChunks}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Vectors</div>
                    <div className="font-bold text-cyan-300">{syncStatus.totalVectors}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Last Sync</div>
                    <div className="font-bold text-slate-300">
                      {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleTimeString() : '—'}
                    </div>
                  </div>
                </div>
                {syncStatus.recentDocs.length > 0 && (
                  <div className="mt-2 border-t border-slate-800/60 pt-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      Recent Documents
                    </div>
                    <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
                      {syncStatus.recentDocs.slice(0, 5).map((d) => (
                        <li key={d.id} className="flex items-center gap-1.5 text-slate-300">
                          <Database className="h-3 w-3 text-slate-500" />
                          <span className="truncate">{d.id}</span>
                          <span className="ml-auto text-slate-500">{d.chunkCount} chunks</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                  Retrieved Context
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] text-slate-300">
                  <span className="text-slate-500">prompt: </span>
                  {prompt.length > 220 ? `${prompt.slice(0, 220)}…` : prompt || '—'}
                </div>
              </section>

              {recalling ? (
                <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 font-mono text-[10px] text-cyan-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recalling chunks from vector store…
                </div>
              ) : recallError ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
                  {recallError}
                </div>
              ) : null}

              <section id="rag-drawer-chunks" className="space-y-2">
                {chunks.length === 0 && !recalling ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center font-mono text-[10px] text-slate-500">
                    No chunks retrieved yet. Run a completion to surface semantic context.
                  </div>
                ) : (
                  chunks.map((chunk, idx) => (
                    <article
                      key={chunk.id}
                      className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3"
                    >
                      <div className="mb-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-cyan-300">
                        <ChevronRight className="h-3 w-3" />
                        chunk #{idx + 1} · {chunk.id}
                        <span className="ml-auto rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-400">
                          score {chunk.score.toFixed(3)}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                    </article>
                  ))
                )}
              </section>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
