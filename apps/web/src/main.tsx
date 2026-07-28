import React, { Suspense, StrictMode } from 'react';
import {createRoot} from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OsStreamProvider } from './components/OsStreamProvider.tsx';
import './index.css';
import './core/registerPlugins';

if (typeof window !== 'undefined') {
  void import('./db/localDb').then(({ getLocalDb }) => {
    getLocalDb();
  });
  void import('./db/syncEngine').then(({ startSyncEngine }) => {
    startSyncEngine();
  });

  window.addEventListener('error', (event) => {
    console.error('[GlobalError]', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[UnhandledRejection]', event.reason);
  });
}

const APP_LOAD_TIMEOUT = 10000;

const App = React.lazy(() => {
  const loadPromise = import('./App.tsx');
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('App module load timed out after ' + APP_LOAD_TIMEOUT + 'ms')), APP_LOAD_TIMEOUT)
  );
  return Promise.race([loadPromise, timeoutPromise]).catch((err) => {
    console.error('[main] Failed to load App module:', err);
    return { default: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h1 className="font-display text-lg font-semibold text-slate-200">Application Bootstrap Failed</h1>
          <pre className="mt-4 max-h-48 overflow-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-rose-400 text-left">
            {err instanceof Error ? err.message : String(err)}
          </pre>
          <button className="mt-4 rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )};
  }) as Promise<{ default: React.ComponentType<object> }>;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-3 border-emerald-400 border-t-transparent" />
            <span className="font-mono text-sm text-emerald-300 font-semibold">Loading Control Tower…</span>
          </div>
        </div>
      }>
        <OsStreamProvider>
          <App />
        </OsStreamProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
