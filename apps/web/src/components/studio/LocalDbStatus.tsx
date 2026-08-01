import { useState, useEffect } from 'react';
import { Database, RefreshCw, Wifi, WifiOff, Shield } from 'lucide-react';
import { getSyncCount } from '../../db/localDb';
import { getSyncState } from '../../db/syncEngine';
import { getThinkTokenQueueLength } from '../../db/thinkTokenBridge';

export default function LocalDbStatus() {
  const [syncPending, setSyncPending] = useState(0);
  const [thinkTokens, setThinkTokens] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const [online, setOnline] = useState(true);
  const [storageUsage, setStorageUsage] = useState('—');

  useEffect(() => {
    const update = () => {
      void getSyncCount().then(setSyncPending);
      setThinkTokens(getThinkTokenQueueLength());
      setLastSync(getSyncState().lastSyncTime);
    };

    update();
    const id = setInterval(update, 4000);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOnline(navigator.onLine);

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      void navigator.storage.estimate().then((est) => {
        if (est.usage && est.quota) {
          setStorageUsage(`${(est.usage / 1024 / 1024).toFixed(1)} MB`);
        }
      });
    }

    return () => {
      clearInterval(id);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="space-y-3 p-4 text-sm font-mono">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-zinc-100">LocalDB</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
          <div className="text-[10px] text-zinc-500 mb-1">Sync Queue</div>
          <div className={`text-sm font-bold ${syncPending > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {syncPending} pending
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
          <div className="text-[10px] text-zinc-500 mb-1">Think Tokens</div>
          <div className="text-sm font-bold text-purple-400">{thinkTokens} queued</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
          <div className="text-[10px] text-zinc-500 mb-1">Network</div>
          <div className="flex items-center gap-1">
            {online ? (
              <Wifi className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-400" />
            )}
            <span className={`text-xs font-bold ${online ? 'text-emerald-400' : 'text-red-400'}`}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
          <div className="text-[10px] text-zinc-500 mb-1">Storage</div>
          <div className="text-sm font-bold text-zinc-300">{storageUsage}</div>
        </div>
      </div>

      {lastSync > 0 && (
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Synced {new Date(lastSync).toLocaleTimeString()}
          </span>
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Local-first
          </span>
        </div>
      )}
    </div>
  );
}
