import React, { Suspense, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OsStreamProvider } from './components/OsStreamProvider.tsx';
import './index.css';
import './core/registerPlugins';

if (typeof window !== 'undefined') {
  (window as any).__KUD_VER = 'v295';
  var el = document.getElementById('root');
  if (el) {
    el.innerHTML = '<div style="position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:monospace;text-align:center"><h1 style="color:#34d399;font-size:1.5rem;margin-bottom:.25rem">Kudbee Fuel Gauge</h1><p style="color:#64748b;font-size:.75rem;margin-bottom:1.5rem">Booting…</p><div style="width:2.5rem;height:2.5rem;border:3px solid #1e293b;border-top-color:#34d399;border-radius:50%;animation:kud-spin .8s linear infinite"></div></div>';

    setTimeout(function() {
      window.dispatchEvent(new CustomEvent('kudbee:loaded', {
        detail: { version: 'v294', ts: Date.now() }
      }));
    }, 200);

    window.addEventListener('error', function(e) {
      // Report error to backend for live debugging
      try { fetch('/api/error-report', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ msg:e.message||'Script failed', stack:e.error?.stack?.slice(0,500)||'', filename:e.filename||'', lineno:e.lineno||0, colno:e.colno||0, ts:new Date().toISOString() }) }).catch(function(){}) } catch (_) {}
      if (el && !el.textContent.trim()) {
        el.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:monospace;text-align:center;padding:1rem"><h1 style="color:#34d399;font-size:1.5rem">Kudbee Fuel Gauge</h1><div style="background:#0f172a;border:1px solid #334155;border-radius:.75rem;padding:1.25rem;margin:1rem 0;max-width:18rem"><p style="color:#f87171;font-weight:600;margin-bottom:.25rem">Error loading app</p><p style="color:#94a3b8;font-size:.7rem;margin-bottom:.75rem">'+(e.message||'Script failed').slice(0,80)+'</p><button onclick="location.reload()" style="background:#059669;color:#fff;border:none;padding:.5rem 1.5rem;border-radius:.5rem;font-weight:600;cursor:pointer">Retry</button></div><p style="font-size:.6rem;color:#475569">v294</p></div>';
      }
    });
  }
}

const APP_LOAD_TIMEOUT = 15000;
let retries = 0;
const MAX_RETRIES = 3;

function renderFallback(message: string) {
  const el = document.getElementById('root');
  if (!el) return;
  el.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:monospace;text-align:center;padding:1rem">
      <h1 style="color:#34d399;font-size:1.5rem;margin-bottom:.5rem">Kudbee Fuel Gauge</h1>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:.75rem;padding:1.5rem;margin:1rem 0;max-width:24rem">
        <p style="color:#${retries >= MAX_RETRIES ? 'f87171' : 'eab308'};font-weight:600;margin-bottom:.25rem">${retries >= MAX_RETRIES ? 'Startup Failed' : 'Retrying…'}</p>
        <p style="color:#94a3b8;font-size:.7rem;margin-bottom:1rem;word-break:break-word">${message}</p>
        <p style="color:#475569;font-size:.6rem;margin-bottom:1rem">Retry ${retries}/${MAX_RETRIES} | ${new Date().toLocaleTimeString()}</p>
        <button onclick="location.reload()" style="background:#059669;color:#fff;border:none;padding:.5rem 1.5rem;border-radius:.5rem;font-weight:600;cursor:pointer">Retry Now</button>
      </div>
      <div id="deploy-footer" style="position:fixed;bottom:0;left:0;right:0;background:#0f172aaa;border-top:1px solid #1e293b;padding:.25rem .75rem;font-size:.6rem;color:#475569"></div>
    </div>`;
  // Show deploy status even in fallback
  fetch('/api/system/deploy-status').then(r => r.json()).then(d => {
    const f = document.getElementById('deploy-footer');
    if (f) { f.textContent = 'Deploy ' + (d.commit || '?').slice(0,7) + ' | ' + d.status + ' | ' + d.herokuRelease; f.className = d.status === 'ok' ? 'ok' : 'degraded'; }
  }).catch(() => {});
}

  const App = React.lazy(() => {
    if (typeof window !== 'undefined') console.log('[BOOT 05] Lazy App.tsx import started', { ts: Date.now() });
    const loadPromise = import('./App.tsx');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('App load timed out after ' + (APP_LOAD_TIMEOUT/1000) + 's')), APP_LOAD_TIMEOUT)
    );
    return Promise.race([loadPromise, timeoutPromise]).catch((err) => {
      retries++;
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') console.error('[BOOT ERR] App load failed', { retries, msg });
      renderFallback(msg);
      if (retries < MAX_RETRIES) {
        setTimeout(() => location.reload(), 3000 * retries);
      }
      return { default: () => null as any };
    }).then((mod) => {
      if (typeof window !== 'undefined') console.log('[BOOT 06] Lazy App.tsx import resolved', { ts: Date.now() });
      return mod;
    }) as Promise<{ default: React.ComponentType<object> }>;
  });

  const BootFallback = React.memo(function BootFallback() {
    React.useEffect(() => {
      if (typeof window !== 'undefined') console.log('[BOOT 04] Suspense fallback mounted — waiting for App', { ts: Date.now() });
      return () => { if (typeof window !== 'undefined') console.log('[BOOT 07] Suspense exited — App ready'); };
    }, []);
    return (
      <div style={{position:'fixed',inset:0,zIndex:50000,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#020617',color:'#e2e8f0',fontFamily:'monospace',textAlign:'center'}}>
        <h1 style={{color:'#34d399',fontSize:'1.5rem',marginBottom:'.25rem'}}>Kudbee Fuel Gauge</h1>
        <p style={{color:'#64748b',fontSize:'.75rem',marginBottom:'1.5rem'}}>Preparing dashboard…</p>
        <div style={{width:'2.5rem',height:'2.5rem',border:'3px solid #1e293b',borderTopColor:'#34d399',borderRadius:'50%',animation:'kud-spin .8s linear infinite'}} />
      </div>
    );
  });

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<BootFallback />}>
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
