import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, X, ChevronRight, Shield } from 'lucide-react';

export interface PendingItem {
  id: string;
  tokenHash: string;
  taskContext: string;
  kdScore: number;
  created: string;
}

interface ApprovalTrayProps {
  items: PendingItem[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onApproveAll: () => void;
}

export function ApprovalTray({ items, onApprove, onDeny, onApproveAll }: ApprovalTrayProps) {
  const [open, setOpen] = useState(false);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  const handleApprove = useCallback((id: string) => {
    setAnimatingIds((prev) => new Set(prev).add(id));
    onApprove(id);
    setTimeout(() => setAnimatingIds((prev) => { const next = new Set(prev); next.delete(id); return next; }), 400);
  }, [onApprove]);

  const handleDeny = useCallback((id: string) => {
    setAnimatingIds((prev) => new Set(prev).add(id));
    onDeny(id);
    setTimeout(() => setAnimatingIds((prev) => { const next = new Set(prev); next.delete(id); return next; }), 400);
  }, [onDeny]);

  const relativeTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="relative z-50 flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-mono text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition-all"
        aria-label="Toggle approval tray"
      >
        <Bell className="w-3 h-3" />
        {items.length > 0 && (
          <span className="flex items-center justify-center h-4 min-w-[16px] rounded-full bg-emerald-500 text-[9px] font-bold text-white px-1">
            {items.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 z-50 h-full w-96 border-l border-slate-800 bg-slate-950 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-xs font-semibold text-slate-200">APPROVAL QUEUE</span>
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">{items.length}</span>
                </div>
                <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <AnimatePresence mode="popLayout">
                  {items.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 font-mono text-[11px]">No pending approvals</div>
                  ) : (
                    items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        exit={{ opacity: 0, x: 100, height: 0 }}
                        className={`rounded-lg border p-3 transition-all ${animatingIds.has(item.id) ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">{item.tokenHash}</span>
                          <span className="font-mono text-[9px] text-slate-600">{relativeTime(item.created)}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 mb-2 line-clamp-2">{item.taskContext}</p>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-amber-400">Kd: {item.kdScore.toFixed(4)}</span>
                          <div className="flex gap-1">
                            {animatingIds.has(item.id) ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <>
                                <button onClick={() => handleDeny(item.id)} className="px-2 py-1 rounded text-[9px] font-mono border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-all">DENY</button>
                                <button onClick={() => handleApprove(item.id)} className="px-2 py-1 rounded text-[9px] font-mono border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-all">APPROVE</button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {items.length > 0 && (
                <div className="px-3 py-2 border-t border-slate-800">
                  <button onClick={onApproveAll} className="w-full py-2 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-all">
                    APPROVE ALL ({items.length})
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
