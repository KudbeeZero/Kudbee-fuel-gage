import React, { Suspense, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OsStreamProvider } from './components/OsStreamProvider.tsx';
import './index.css';
import './core/registerPlugins';

if (typeof window !== 'undefined') {
  window.__KUD_VER = 'v294';
  var el = document.getElementById('root');
  if (el) {
    el.innerHTML = '<div style="position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:monospace;text-align:center"><h1 style="color:#34d399;font-size:1.5rem;margin-bottom:.25rem">Kudbee Fuel Gauge</h1><p style="color:#64748b;font-size:.75rem;margin-bottom:1.5rem">Booting…</p><div style="width:2.5rem;height:2.5rem;border:3px solid #1e293b;border-top-color:#34d399;border-radius:50%;animation:kud-spin .8s linear infinite"></div></div>';

    setTimeout(function() {
      window.dispatchEvent(new CustomEvent('kudbee:loaded', {
        detail: { version: 'v294', ts: Date.now() }
      }));
    }, 200);

    window.addEventListener('error', function(e) {
      if (el && !el.textContent.trim()) {
        el.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:monospace;text-align:center;padding:1rem"><h1 style="color:#34d399;font-size:1.5rem">Kudbee Fuel Gauge</h1><div style="background:#0f172a;border:1px solid #334155;border-radius:.75rem;padding:1.25rem;margin:1rem 0;max-width:18rem"><p style="color:#f87171;font-weight:600;margin-bottom:.25rem">Error loading app</p><p style="color:#94a3b8;font-size:.7rem;margin-bottom:.75rem">'+(e.message||'Script failed').slice(0,80)+'</p><button onclick="location.reload()" style="background:#059669;color:#fff;border:none;padding:.5rem 1.5rem;border-radius:.5rem;font-weight:600;cursor:pointer">Retry</button></div><p style="font-size:.6rem;color:#475569">v294</p></div>';
      }
    });
  }
}

const APP_LOAD_TIMEOUT = 8000;

const App = React.lazy(() => {
  const loadPromise = import('./App.tsx');
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('App load timed out')), APP_LOAD_TIMEOUT)
  );
  return Promise.race([loadPromise, timeoutPromise]).catch((err) => {
    return { default: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-200">Bootstrap Failed</h1>
          <pre className="mt-4 max-h-48 overflow-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-rose-400 text-left">
            {err instanceof Error ? err.message : String(err)}
          </pre>
          <button className="mt-4 rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )};
  }) as Promise<{ default: React.ComponentType<object> }>;
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<></>}>
          <OsStreamProvider>
            <App />
          </OsStreamProvider>
        </Suspense>
      </ErrorBoundary>
    </StrictMode>
  );

  // Dispatch event to signal React has mounted — used by index.html to suppress error card
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('kudbee:loaded', {
      detail: { version: (window as any).__KUD_VER, ts: Date.now() }
    }));
  }, 100);
}
