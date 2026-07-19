import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Sliders, Mail, MessageSquare, Webhook, Hash, Save, Activity, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface AlertRule {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  color: string;
}

interface NotificationChannel {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  color: string;
}

interface AlertLog {
  id: number;
  timestamp: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
}

const INITIAL_RULES: AlertRule[] = [
  {
    id: 'budget',
    label: 'Budget Threshold',
    description: 'Alert when 24h Live Pipeline Cost exceeds $X',
    value: 120,
    min: 10,
    max: 500,
    unit: '$',
    color: 'emerald'
  },
  {
    id: 'token',
    label: 'Token Anomaly',
    description: 'Alert when output tokens spike X% above baseline',
    value: 35,
    min: 5,
    max: 100,
    unit: '%',
    color: 'amber'
  },
  {
    id: 'latency',
    label: 'Latency Tripwire',
    description: 'Alert when API response time exceeds X ms',
    value: 2000,
    min: 500,
    max: 5000,
    unit: 'ms',
    color: 'rose'
  }
];

const INITIAL_CHANNELS: NotificationChannel[] = [
  { id: 'email', label: 'Email', icon: Mail, enabled: true, color: 'emerald' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, enabled: false, color: 'amber' },
  { id: 'webhook', label: 'Webhook', icon: Webhook, enabled: true, color: 'cyan' },
  { id: 'slack', label: 'Slack', icon: Hash, enabled: false, color: 'purple' }
];

const MOCK_ALERT_LOGS: AlertLog[] = [
  { id: 1, timestamp: '2026-07-18T23:45:12Z', level: 'CRITICAL', message: 'Budget Threshold Exceeded: $52.00' },
  { id: 2, timestamp: '2026-07-18T22:30:45Z', level: 'WARNING', message: 'Token Anomaly Detected: +47% above baseline' },
  { id: 3, timestamp: '2026-07-18T21:15:33Z', level: 'CRITICAL', message: 'Latency Tripwire Tripped: 3,240ms' },
  { id: 4, timestamp: '2026-07-18T20:00:00Z', level: 'INFO', message: 'Webhook Delivery Failed: endpoint timeout' }
];

export function AlertsView() {
  const [rules, setRules] = useState<AlertRule[]>(INITIAL_RULES);
  const [channels, setChannels] = useState<NotificationChannel[]>(INITIAL_CHANNELS);
  const [logs] = useState<AlertLog[]>(MOCK_ALERT_LOGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateRule = (id: string, value: number) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, value } : r));
  };

  const toggleChannel = (id: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  };

  const getLevelStyles = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'WARNING':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'WARNING':
        return <Activity className="w-3.5 h-3.5" />;
      default:
        return <Info className="w-3.5 h-3.5" />;
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'emerald':
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          accent: 'accent-emerald-500',
          sliderTrack: 'bg-emerald-500',
          toggleBg: 'bg-emerald-500'
        };
      case 'amber':
        return {
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          accent: 'accent-amber-500',
          sliderTrack: 'bg-amber-500',
          toggleBg: 'bg-amber-500'
        };
      case 'rose':
        return {
          text: 'text-rose-400',
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          accent: 'accent-rose-500',
          sliderTrack: 'bg-rose-500',
          toggleBg: 'bg-rose-500'
        };
      case 'cyan':
        return {
          text: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          accent: 'accent-cyan-500',
          sliderTrack: 'bg-cyan-500',
          toggleBg: 'bg-cyan-500'
        };
      case 'purple':
        return {
          text: 'text-purple-400',
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/30',
          accent: 'accent-purple-500',
          sliderTrack: 'bg-purple-500',
          toggleBg: 'bg-purple-500'
        };
      default:
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          accent: 'accent-emerald-500',
          sliderTrack: 'bg-emerald-500',
          toggleBg: 'bg-emerald-500'
        };
    }
  };

  return (
    <div className="space-y-6" id="alerts-view-container">
      {/* HEADER */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-5 h-5 text-purple-400" />
          <div>
            <h2 className="font-display font-semibold text-slate-200 text-lg">Interactive Alerts Threshold Engine</h2>
            <p className="text-xs text-slate-500 mt-1">Configure dynamic alert thresholds and notification routing channels.</p>
          </div>
        </div>
      </div>

      {/* THRESHOLD SLIDERS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Sliders className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-display font-semibold text-slate-200 text-sm">Threshold Configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">Drag sliders to set dynamic alert tripwires.</p>
          </div>
        </div>

        <div className="space-y-6">
          {rules.map((rule) => {
            const colors = getColorClasses(rule.color);
            return (
            <div key={rule.id} className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="space-y-1 flex-1">
                  <span className={`block text-xs font-bold font-mono uppercase tracking-wider ${colors.text}`}>
                    {rule.label}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {rule.description}
                  </span>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                  <span className={`font-mono text-sm font-bold ${colors.text} ${colors.bg} border ${colors.border} px-3 py-1 rounded-lg min-w-[80px] text-center`}>
                    {rule.unit === '$' ? '$' : ''}{rule.value.toLocaleString()}{rule.unit !== '$' ? ` ${rule.unit}` : ''}
                  </span>
                </div>
              </div>
              
              <div className="relative pt-1">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono text-slate-500 w-12">{rule.min}{rule.unit}</span>
                  <input
                    type="range"
                    min={rule.min}
                    max={rule.max}
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, parseInt(e.target.value, 10))}
                    className={`flex-1 h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer ${colors.accent} active:scale-95 transition-transform duration-75`}
                  />
                  <span className="text-[10px] font-mono text-slate-500 w-16 text-right">{rule.max}{rule.unit}</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* NOTIFICATION TOGGLES */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-display font-semibold text-slate-200 text-sm">Notification Routing</h3>
            <p className="text-xs text-slate-500 mt-0.5">Select channels for alert broadcast delivery.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {channels.map((channel) => {
            const Icon = channel.icon;
            const colors = getColorClasses(channel.color);
            return (
              <button
                key={channel.id}
                onClick={() => toggleChannel(channel.id)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer active:scale-95 duration-75 ${
                  channel.enabled
                    ? `${colors.bg} ${colors.border} ${colors.text}`
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`w-5 h-5 ${channel.enabled ? colors.text : 'text-slate-600'}`} />
                  <div
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      channel.enabled ? colors.toggleBg : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                        channel.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
                <span className="block text-xs font-mono font-bold uppercase tracking-wider">{channel.label}</span>
                <span className={`block text-[10px] mt-0.5 ${channel.enabled ? 'text-slate-400' : 'text-slate-600'}`}>
                  {channel.enabled ? 'Active' : 'Inactive'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RECENT TRIGGERS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-display font-semibold text-slate-200 text-sm">Recent Triggers</h3>
            <p className="text-xs text-slate-500 mt-0.5">Historical alert events and threshold violations.</p>
          </div>
        </div>

        <div className="bg-slate-950/50 rounded-lg border border-slate-800 p-4 font-mono overflow-y-auto max-h-80">
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getLevelStyles(log.level)}`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getLevelIcon(log.level)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      [{log.level}]
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 break-all">{log.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SAVE BUTTON */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer active:scale-95 duration-75 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Thresholds
            </>
          )}
        </button>
      </div>
    </div>
  );
}
