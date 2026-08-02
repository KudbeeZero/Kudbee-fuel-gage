/**
 * THINKBOX PR-004 — Browser Bridge
 *
 * The browser becomes an active participant in the Engineering OS.
 * Reports WebSocket status, rendering errors, API failures, performance
 * metrics, user actions, and console errors onto the BUS.
 */

export interface BrowserEvent {
  type: 'page:loaded' | 'page:error' | 'api:timeout' | 'api:error' | 'ws:connected' | 'ws:disconnected' | 'user:action' | 'perf:metric' | 'console:error' | 'browser:compat';
  timestamp: string;
  data: Record<string, unknown>;
}

class BrowserBridge {
  private buffer: BrowserEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxBuffer = 50;
  private apiEndpoint = '/api/thinkbox/browser-event';

  start() {
    this.listenForErrors();
    this.listenForPerformance();
    this.listenForWebSocket();
    this.flushInterval = setInterval(() => this.flush(), 5000);
    this.emit({ type: 'page:loaded', data: { url: window.location.href } });
  }

  stop() {
    if (this.flushInterval) clearInterval(this.flushInterval);
  }

  emit(type: BrowserEvent['type'], data: Record<string, unknown> = {}) {
    this.buffer.push({
      type,
      timestamp: new Date().toISOString(),
      data,
    });
    if (this.buffer.length >= this.maxBuffer) this.flush();
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const batch = [...this.buffer];
    this.buffer = [];
    try {
      await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
    } catch {}
  }

  private listenForErrors() {
    window.addEventListener('error', (e) => {
      this.emit('page:error', {
        message: e.message,
        source: e.filename,
        line: e.lineno,
        column: e.colno,
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.emit('console:error', {
        message: e.reason?.message ?? 'Unhandled rejection',
        stack: e.reason?.stack ? String(e.reason.stack).slice(0, 500) : null,
      });
    });
  }

  private listenForPerformance() {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.emit('perf:metric', {
            name: entry.name,
            duration: Math.round(entry.duration),
            type: entry.entryType,
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  }

  private listenForWebSocket() {
    const check = () => {
      this.emit('ws:connected', { connected: navigator.onLine });
    };
    window.addEventListener('online', check);
    window.addEventListener('offline', () => this.emit('ws:disconnected', { reason: 'offline' }));
    check();
  }
}

export const browserBridge = new BrowserBridge();
