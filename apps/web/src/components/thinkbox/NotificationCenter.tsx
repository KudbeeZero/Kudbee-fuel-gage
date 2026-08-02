/**
 * THINKBOX PR-006 — Notification Center
 *
 * Unified notification panel. Groups by severity, supports read/unread,
 * actionable notifications. Every subsystem publishes alerts here.
 */

import { useState } from 'react';
import {
  Bell, BellOff, CheckCircle2, AlertTriangle, Info, XCircle,
  Zap, Shield, Play, ExternalLink, Check,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warn' | 'error';
  timestamp: string;
  read: boolean;
  actionable: boolean;
  action?: { label: string; handler: string };
  source: string;
}

interface NotificationCenterProps {
  notifications?: Notification[];
  onAction?: (notification: Notification) => void;
  onMarkAllRead?: () => void;
}

export function NotificationCenter({ notifications: external, onAction, onMarkAllRead }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>(external ?? [
    { id: 'n1', type: 'agent-completed', title: 'FORGE completed task', message: 'Provision plan generated successfully', severity: 'success', timestamp: new Date(Date.now() - 30000).toISOString(), read: false, actionable: false, source: 'FORGE' },
    { id: 'n2', type: 'approval-required', title: 'Approval Required', message: '8 install commands require user approval', severity: 'warn', timestamp: new Date(Date.now() - 120000).toISOString(), read: false, actionable: true, action: { label: 'Review', handler: 'nav:approvals' }, source: 'GATE' },
    { id: 'n3', type: 'workspace-ready', title: 'Workspace Ready', message: 'Kudbee project — 73 steps planned, Score 100/A', severity: 'success', timestamp: new Date(Date.now() - 300000).toISOString(), read: true, actionable: false, source: 'KILOH' },
    { id: 'n4', type: 'info', title: 'Plugin Loaded', message: '5 core plugins registered: Agent Swarm, Execution, Timeline, Terminal, Architecture', severity: 'info', timestamp: new Date(Date.now() - 600000).toISOString(), read: true, actionable: false, source: 'SYSTEM' },
    { id: 'n5', type: 'test-failed', title: 'Test Failure', message: 'TypeScript check unavailable in sandbox', severity: 'warn', timestamp: new Date(Date.now() - 1200000).toISOString(), read: true, actionable: false, source: 'GATE' },
  ]);

  const [filter, setFilter] = useState<string | null>(null);
  const unread = notifications.filter(n => !n.read).length;

  const filtered = filter ? notifications.filter(n => n.severity === filter) : notifications;

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      default: return <Info className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
            <Bell className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Notifications</h3>
            <p className="text-[10px] text-slate-500">{unread} unread · {notifications.length} total</p>
          </div>
        </div>
        <div className="flex gap-1">
          {['info', 'success', 'warn', 'error'].map(s => (
            <button key={s}
              onClick={() => setFilter(filter === s ? null : s)}
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${filter === s ? 'bg-slate-700/50 text-slate-300' : 'text-slate-600 hover:text-slate-400'}`}>
              {s}
            </button>
          ))}
          {onMarkAllRead && (
            <button onClick={onMarkAllRead} className="text-[9px] px-1.5 py-0.5 text-slate-500 hover:text-slate-300">
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-[10px] text-slate-600 py-4 text-center">No notifications</div>
        ) : (
          filtered.map(n => (
            <button key={n.id}
              onClick={() => { markAsRead(n.id); if (n.actionable) onAction?.(n); }}
              className={`w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors ${
                n.read ? 'bg-slate-950/30' : 'bg-slate-800/20 border-l-2 border-l-emerald-400'
              } hover:bg-slate-800/30`}>
              {severityIcon(n.severity)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-300 truncate">{n.title}</span>
                  <span className="text-[8px] text-slate-600 ml-2 shrink-0">{new Date(n.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-[9px] text-slate-500 truncate">{n.message}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[8px] text-slate-600">{n.source}</span>
                  {n.actionable && n.action && (
                    <span className="text-[8px] text-emerald-400 font-mono">{n.action.label}</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
