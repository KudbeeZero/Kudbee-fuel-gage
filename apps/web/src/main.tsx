import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OsStreamProvider } from './components/OsStreamProvider.tsx';
import './index.css';
import './core/registerPlugins';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            <p className="font-mono text-xs text-slate-500 uppercase tracking-widest">Initializing Control Tower</p>
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
