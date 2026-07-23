import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sliders,
  Bell,
  DollarSign,
  Database,
  Check,
  EyeOff,
  Trash2,
  Sparkles
} from 'lucide-react';
import { apiPost } from '../lib/apiClient';

interface SettingsViewProps {
  currency: 'USD' | 'EUR' | 'GBP';
  setCurrency: (c: 'USD' | 'EUR' | 'GBP') => void;
  initialSubTab: 'System Engine Settings' | 'Threshold Alert Rules';
  displayDensity: 'Compact' | 'Standard' | 'Comfortable';
  setDisplayDensity: (d: 'Compact' | 'Standard' | 'Comfortable') => void;
  onPurgeCompleted: () => void;
  showToast: (msg: string) => void;
  theme: 'Deep Space' | 'Midnight';
  setTheme: (t: 'Deep Space' | 'Midnight') => void;
  reducedMotion: boolean;
  setReducedMotion: (r: boolean) => void;
}

export function SettingsView({
  currency,
  setCurrency,
  initialSubTab,
  displayDensity,
  setDisplayDensity,
  onPurgeCompleted,
  showToast,
  theme,
  setTheme,
  reducedMotion,
  setReducedMotion
}: SettingsViewProps) {
  const [subTab, setSubTab] = useState<'System Engine Settings' | 'Threshold Alert Rules'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [dailySpendCap, setDailySpendCap] = useState(() => parseFloat(localStorage.getItem('kudbee_spend_cap') || '100.00'));
  const [tokenWarningThreshold, setTokenWarningThreshold] = useState(() => parseInt(localStorage.getItem('kudbee_token_warn') || '50000', 10));
  const [healthCeiling, setHealthCeiling] = useState(() => parseInt(localStorage.getItem('kudbee_health_ceil') || '20', 10));

  const handleSaveThresholds = () => {
    localStorage.setItem('kudbee_spend_cap', dailySpendCap.toString());
    localStorage.setItem('kudbee_token_warn', tokenWarningThreshold.toString());
    localStorage.setItem('kudbee_health_ceil', healthCeiling.toString());
    showToast("Threshold alert parameter bounds saved to SQLite cache.");
  };

  const handlePurgeCache = async () => {
    try {
      await apiPost('/api/telemetry/purge', {});
      showToast("\u26a0\ufe0f Local SQLite Telemetry Database Cache Purged Successfully.");
      onPurgeCompleted();
    } catch (err) {
      console.error(err);
      showToast("Purge action failed. Check if local FastAPI backend is active.");
    }
  };

  const currencies: { id: 'USD' | 'EUR' | 'GBP'; label: string; symbol: string; desc: string }[] = [
    { id: 'USD', label: 'US Dollar', symbol: '$', desc: 'United States Dollar (Baseline baseline format)' },
    { id: 'EUR', label: 'Euro', symbol: '\u20ac', desc: 'European Union Euro (Exchange Rate: 1 USD = 0.92 EUR)' },
    { id: 'GBP', label: 'British Pound', symbol: '\u00a3', desc: 'United Kingdom Pound Sterling (Exchange Rate: 1 USD = 0.78 GBP)' }
  ];

  return (
    <div className="min-h-dvh flex flex-col space-y-6" id="settings-view-container">
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 max-w-lg w-full self-center md:self-start">
        <button
          onClick={() => setSubTab('System Engine Settings')}
          className={`flex-1 py-2 px-4 rounded-lg font-mono text-xs uppercase tracking-widest font-semibold transition-all duration-200 cursor-pointer ${
            subTab === 'System Engine Settings'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          System Engine Settings
        </button>
        <button
          onClick={() => setSubTab('Threshold Alert Rules')}
          className={`flex-1 py-2 px-4 rounded-lg font-mono text-xs uppercase tracking-widest font-semibold transition-all duration-200 cursor-pointer ${
            subTab === 'Threshold Alert Rules'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Threshold Alert Rules
        </button>
      </div>

      <AnimatePresence mode="wait">
        {subTab === 'System Engine Settings' ? (
          <motion.div
            key="system-settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">UI Display Density Engine</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Alters global component grid padding and typography scaling ratios dynamically.</p>
                </div>
              </div>

              <div className="flex gap-4 p-1 bg-slate-950 border border-slate-800 rounded-lg max-w-md">
                {(['Compact', 'Standard', 'Comfortable'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setDisplayDensity(mode);
                      showToast(`UI Layout set to ${mode} density mode.`);
                    }}
                    className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                      displayDensity === mode
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="theme-settings-card">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Global Legibility Theme</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Switch between Deep Space ambient dark and Midnight high-contrast black.</p>
                </div>
              </div>

              <div className="flex gap-4 p-1 bg-slate-950 border border-slate-800 rounded-lg max-w-md">
                {(['Deep Space', 'Midnight'] as const).map((t) => (
                  <button
                    key={t}
                    id={`theme-btn-${t.toLowerCase().replace(' ', '-')}`}
                    onClick={() => {
                      setTheme(t);
                    }}
                    className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                      theme === t
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="reduced-motion-settings-card">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-4">
                <EyeOff className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Reduced Motion Accessibility</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Disable all animation-pulse effects and screen-flicker scanline overlays for users with vestibular sensitivities.</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-850 rounded-lg">
                <div className="space-y-1 pr-4">
                  <span className="block text-xs font-semibold text-slate-300">Vestibular Motion & Flicker Suppression</span>
                  <span className="block text-[10px] text-slate-500">
                    Activates static high-contrast border states instead of animations, pulsing badges, and CRT/scanline overlay effects.
                  </span>
                </div>
                <button
                  id="reduced-motion-toggle-btn"
                  onClick={() => {
                    setReducedMotion(!reducedMotion);
                    showToast(!reducedMotion ? "Reduced Motion enabled. Pulsing and scanlines disabled." : "Reduced Motion disabled.");
                  }}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    reducedMotion ? 'bg-rose-500' : 'bg-slate-800'
                  }`}
                  aria-label="Toggle Reduced Motion mode"
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      reducedMotion ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-6">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Global Currency Format</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Select the workspace currency representation. Auto-converted based on standard regional rates.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {currencies.map((curr) => {
                  const isSelected = currency === curr.id;
                  return (
                    <button
                      key={curr.id}
                      onClick={() => setCurrency(curr.id)}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 relative ${
                        isSelected
                          ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.1)]'
                          : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-mono text-xs font-bold tracking-wide uppercase">{curr.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {curr.id}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-2xl font-extrabold text-slate-100 block">
                          {curr.symbol}
                        </span>
                        <span className="text-[9px] text-slate-500 block leading-tight mt-1">
                          {curr.desc}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-slate-950">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-6">
                <Database className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Infrastructure Control Panel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Synchronize local cache systems and daemon telemetry ingestion parameters.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="border border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <span className="block text-xs font-bold text-amber-400 font-mono uppercase tracking-wider">Danger Zone: Purge Cache</span>
                    <span className="block text-[10px] text-slate-400 max-w-xl">
                      Irreversibly deletes all rows inside the SQLite local database trace logs and resets API route limit quotas.
                    </span>
                  </div>
                  <button
                    onClick={handlePurgeCache}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 border border-amber-500/40 hover:bg-amber-500/10 active:bg-amber-500/20 text-amber-400 text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Purge Local SQLite Cache
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="alerts-settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Threshold Alert Rules</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Establish billing, consumption, and subscription safety margins. Tests trigger dynamic layout notifications.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Daily Consumption Spend Cap ($)</span>
                    <span className="block text-[11px] text-slate-500">
                      Broadcasting triggers when overall pipeline costs exceed the designated USD value.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={dailySpendCap}
                      onChange={(e) => setDailySpendCap(parseFloat(e.target.value) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("\u26a0\ufe0f Warning: Daily Gateway Budget Exceeded")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Single Gateway Payload Token Warning</span>
                    <span className="block text-[11px] text-slate-500">
                      Alert triggers if any trace log logs a payload containing more than this raw token count.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={tokenWarningThreshold}
                      onChange={(e) => setTokenWarningThreshold(parseInt(e.target.value, 10) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("\u26a0\ufe0f Warning: Single Gateway Payload Limit Violated")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <span className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-400">Minimum Subscription Health Ceiling (%)</span>
                    <span className="block text-[11px] text-slate-500">
                      Alert broadcasts warning logs immediately if any active quota tracker's remaining percentage drops below this health ceiling.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <input
                      type="number"
                      value={healthCeiling}
                      onChange={(e) => setHealthCeiling(parseInt(e.target.value, 10) || 0)}
                      className="w-32 scroll-mt-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-right"
                    />
                    <button
                      onClick={() => showToast("\u26a0\ufe0f Warning: Subscription Health is below Minimum Ceiling!")}
                      title="Test Trigger Rule"
                      className="p-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-400 rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveThresholds}
                  className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-400 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer"
                >
                  Save Alert Bounds
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
