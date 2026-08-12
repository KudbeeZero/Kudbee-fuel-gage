import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Command,
  Ellipsis,
  MessageSquare,
  Plus,
  Radio,
  Sparkles,
  Users,
  Wifi,
} from 'lucide-react';

type SessionStatus = 'working' | 'waiting' | 'paused';

interface WorkspaceSession {
  id: string;
  title: string;
  summary: string;
  agent: string;
  status: SessionStatus;
  updatedAt: string;
  accent: string;
}

interface WorkspaceNote {
  id: string;
  title: string;
  detail: string;
  age: string;
  tone: 'amber' | 'blue' | 'violet';
}

const initialSessions: WorkspaceSession[] = [
  {
    id: 'session-ops',
    title: 'Staging reliability pass',
    summary: 'Checking the queue handoff and Redis degraded path before release.',
    agent: 'DeepSeek V4',
    status: 'working',
    updatedAt: 'just now',
    accent: 'emerald',
  },
  {
    id: 'session-product',
    title: 'Workspace interaction model',
    summary: 'Shaping the operator flow around attention, context, and recovery.',
    agent: 'Qwen 3.6 Pro',
    status: 'waiting',
    updatedAt: '8 min ago',
    accent: 'sky',
  },
  {
    id: 'session-memory',
    title: 'THINK evidence review',
    summary: 'Comparing recent decisions with the current release gates.',
    agent: 'Hermes',
    status: 'paused',
    updatedAt: '24 min ago',
    accent: 'violet',
  },
];

const attention: WorkspaceNote[] = [
  {
    id: 'attention-1',
    title: 'One approval needs your decision',
    detail: 'Gastown outcome is waiting in the governance queue.',
    age: '2 min',
    tone: 'amber',
  },
  {
    id: 'attention-2',
    title: 'Staging is running degraded',
    detail: 'Redis is unavailable locally; writes are being evaluated for durability.',
    age: '5 min',
    tone: 'blue',
  },
  {
    id: 'attention-3',
    title: 'A learning note is ready',
    detail: 'The last verification run added a DTHINK evidence record.',
    age: '12 min',
    tone: 'violet',
  },
];

const statusLabel: Record<SessionStatus, string> = {
  working: 'Working',
  waiting: 'Waiting for you',
  paused: 'Paused',
};

const statusClass: Record<SessionStatus, string> = {
  working: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  waiting: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  paused: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
};

const noteClass: Record<WorkspaceNote['tone'], string> = {
  amber: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-200',
  blue: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-200',
  violet: 'border-violet-400/20 bg-violet-400/[0.06] text-violet-200',
};

export function WorkspacePage() {
  const [sessions, setSessions] = useState<WorkspaceSession[]>(() => {
    try {
      const saved = localStorage.getItem('kudbee_workspace_sessions');
      return saved ? (JSON.parse(saved) as WorkspaceSession[]) : initialSessions;
    } catch {
      return initialSessions;
    }
  });
  const [activeSessionId, setActiveSessionId] = useState(initialSessions[0]!.id);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    localStorage.setItem('kudbee_workspace_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  );

  const createSession = () => {
    const next: WorkspaceSession = {
      id: `session-${Date.now()}`,
      title: 'Untitled workspace',
      summary: 'A new shared space for a focused piece of work.',
      agent: 'Unassigned',
      status: 'waiting',
      updatedAt: 'just now',
      accent: 'sky',
    };
    setSessions((current) => [next, ...current]);
    setActiveSessionId(next.id);
  };

  const sendMessage = () => {
    if (!draft.trim() || !activeSession) return;
    setSessions((current) => current.map((session) => (
      session.id === activeSession.id
        ? { ...session, status: 'working', updatedAt: 'just now', summary: draft.trim() }
        : session
    )));
    setDraft('');
  };

  return (
    <section className="workspace-shell overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1118]/90 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex min-h-[680px] flex-col lg:flex-row">
        <aside className="workspace-rail border-b border-slate-800/80 bg-[#0d151d] lg:w-[238px] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-300/80">
                <Sparkles className="h-3.5 w-3.5" />
                Shared workspace
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-slate-100">Lemonade desk</p>
              <p className="mt-1 max-w-[180px] text-xs leading-5 text-slate-500">A calm place to pick up work, see what needs attention, and hand context to an agent.</p>
            </div>
            <button aria-label="Create workspace" onClick={createSession} className="workspace-icon-button lg:mt-5">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="border-t border-slate-800/70 px-3 py-3 lg:mt-3">
            <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">
              <span>Sessions</span>
              <span>{sessions.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`workspace-session-tab ${activeSession?.id === session.id ? 'is-active' : ''}`}
                >
                  <span className={`workspace-session-dot ${session.status}`} />
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-xs font-medium text-slate-200">{session.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-600">{session.agent}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="hidden border-t border-slate-800/70 px-5 py-4 lg:block">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">
              <Users className="h-3.5 w-3.5" />
              People & agents
            </div>
            <div className="mt-3 flex -space-x-2">
              {['DS', 'QW', 'HE'].map((label, index) => (
                <span key={label} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0d151d] text-[9px] font-bold ${index === 0 ? 'bg-emerald-400/20 text-emerald-200' : index === 1 ? 'bg-sky-400/20 text-sky-200' : 'bg-violet-400/20 text-violet-200'}`}>
                  {label}
                </span>
              ))}
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0d151d] bg-slate-800 text-[10px] text-slate-400">+2</span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">
                <span className="text-emerald-400">Workspace</span>
                <span>/</span>
                <span className="truncate">{activeSession?.title}</span>
              </div>
              <h1 className="mt-2 truncate font-display text-xl font-semibold text-slate-100">Good work has a place to land.</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
                <Wifi className="h-3 w-3" /> Local-first
              </span>
              <button className="workspace-icon-button" aria-label="Workspace options"><Ellipsis className="h-4 w-4" /></button>
            </div>
          </header>

          <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_270px]">
            <main className="min-w-0">
              <div className="workspace-hero relative overflow-hidden rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/[0.11] via-slate-900/70 to-sky-400/[0.06] p-5 sm:p-7">
                <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-emerald-300/10 blur-3xl" />
                <div className="relative max-w-xl">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300/80">
                    <Radio className="h-3.5 w-3.5" /> {activeSession?.status === 'working' ? 'Agent is in motion' : 'Ready when you are'}
                  </div>
                  <h2 className="mt-4 font-display text-2xl font-semibold leading-tight text-slate-50 sm:text-3xl">{activeSession?.summary}</h2>
                  <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400">Keep the request, evidence, and decision together. When you leave, the session remains resumable instead of disappearing into a chat transcript.</p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase ${statusClass[activeSession?.status ?? 'waiting']}`}>{statusLabel[activeSession?.status ?? 'waiting']}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Updated {activeSession?.updatedAt}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Command className="h-3.5 w-3.5" /> {activeSession?.agent}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Continue the thread</p>
                    <p className="mt-1 text-xs text-slate-600">Context stays attached to this workspace.</p>
                  </div>
                  <MessageSquare className="h-4 w-4 text-slate-600" />
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 focus-within:border-emerald-400/30 focus-within:ring-1 focus-within:ring-emerald-400/10">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') sendMessage();
                    }}
                    rows={3}
                    placeholder="Add context, a question, or the next decision..."
                    className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-700"
                  />
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800/70 pt-3">
                    <span className="text-[10px] font-mono text-slate-700">⌘ ↵ to send</span>
                    <button onClick={sendMessage} disabled={!draft.trim()} className="workspace-send-button"><ArrowUpRight className="h-3.5 w-3.5" /> Continue</button>
                  </div>
                </div>
              </div>

              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">Recent movement</p>
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-700">Live activity</span>
                </div>
                <div className="space-y-2">
                  {[
                    ['Now', 'DeepSeek V4', 'Finished the Redis argument-encoding check.', 'emerald'],
                    ['8 min', 'Qwen 3.6 Pro', 'Marked the mobile governance screen as the next UX slice.', 'sky'],
                    ['24 min', 'You', 'Approved the staging verification direction.', 'violet'],
                  ].map(([age, actor, message, tone]) => (
                    <div key={`${age}-${actor}`} className="flex gap-3 rounded-xl border border-slate-800/70 bg-slate-900/25 px-3 py-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone === 'emerald' ? 'bg-emerald-400' : tone === 'sky' ? 'bg-sky-400' : 'bg-violet-400'}`} />
                      <div className="min-w-0 flex-1"><p className="text-xs text-slate-300"><span className="font-medium text-slate-100">{actor}</span> {message}</p><p className="mt-1 text-[10px] font-mono text-slate-700">{age} ago</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </main>

            <aside className="xl:border-l xl:border-slate-800/70 xl:pl-6">
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-200">Your attention</p><p className="mt-1 text-xs text-slate-600">Small list, clear next moves.</p></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400/10 px-2 text-[10px] font-mono text-amber-300">3</span></div>
              <div className="mt-4 space-y-2">
                {attention.map((item) => <button key={item.id} className={`workspace-attention-card ${noteClass[item.tone]}`}><span className="flex items-start justify-between gap-3"><span className="text-left text-xs font-medium">{item.title}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-70" /></span><span className="mt-2 block text-left text-[11px] leading-5 text-slate-400">{item.detail}</span><span className="mt-3 flex items-center gap-1 text-left text-[10px] font-mono opacity-60"><Clock3 className="h-3 w-3" /> {item.age} ago</span></button>)}
              </div>
              <div className="mt-6 rounded-xl border border-slate-800/70 bg-slate-900/25 p-4"><div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600"><Check className="h-3.5 w-3.5 text-emerald-400" /> Workspace promise</div><p className="mt-3 text-xs leading-5 text-slate-400">No silent handoffs. Every session tells you who is working, what changed, and what needs a human decision.</p></div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
