import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

/**
 * AgentTerminal — real terminal emulation for the Kudbee agent cockpit.
 * Uses xterm.js (same engine as VS Code) instead of a React-managed
 * chat box. Each keystroke is a real terminal event; commands go to
 * POST /api/terminal/execute; SSE streams render live.
 *
 * Backend protocol (server-side commandDispatcher.mjs):
 *   - POST /api/terminal/execute {command} → {type, answer|message|...}
 *   - Plain text auto-routes to /ask (Gemini)
 *   - /code /swarm /shield /roadmap /security /echo /forecast /handoff
 *     /pulse /guardian /crypto /middleware /crucible /invariants /scorecard
 */

interface AgentTerminalProps {
  height?: string;
  autoFocus?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AgentTerminal({ height = '100%', autoFocus = true, collapsed = false, onToggleCollapse }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const bufferRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#34d399',
        cursorAccent: '#020617',
        selectionBackground: '#1e293b',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#f59e0b',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#64748b',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // ── Welcome banner ──
    term.writeln('\x1b[38;2;52;211;153mKUDBEE AGENT TERMINAL\x1b[0m');
    term.writeln('\x1b[38;2;100;116;139mEngineering OS v2.2 · xterm.js engine\x1b[0m');
    term.writeln('\x1b[38;2;100;116;139mType /help for commands, or just ask a question.\x1b[0m');
    term.write('\r\n\x1b[38;2;52;211;153mkudbee@os\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ ');

    // ── Input handling ──
    term.onData((data) => {
      if (data === '\r') {
        term.write('\r\n');
        const cmd = bufferRef.current.trim();
        if (cmd) {
          historyRef.current.push(cmd);
          histIdxRef.current = historyRef.current.length;
          void executeCommand(cmd);
        }
        bufferRef.current = '';
        term.write('\x1b[38;2;52;211;153mkudbee@os\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ ');
      } else if (data === '\x7f' || data === '\b') {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\x1b[A') { // up
        if (histIdxRef.current > 0) {
          histIdxRef.current--;
          bufferRef.current = historyRef.current[histIdxRef.current] || '';
          term.write('\x1b[2K\r\x1b[38;2;52;211;153mkudbee@os\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ ' + bufferRef.current);
        }
      } else if (data === '\x1b[B') { // down
        if (histIdxRef.current < historyRef.current.length) {
          histIdxRef.current++;
          bufferRef.current = historyRef.current[histIdxRef.current] || '';
          term.write('\x1b[2K\r\x1b[38;2;52;211;153mkudbee@os\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ ' + bufferRef.current);
        }
      } else if (data.length === 1 && data >= ' ' && data !== '\x1b') {
        bufferRef.current += data;
        term.write(data);
      }
    });

    // ── Resize ──
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
  }, []);

  async function executeCommand(cmd: string) {
    const term = termRef.current;
    if (!term) return;
    try {
      const res = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();

      if (data.answer) {
        term.writeln('\x1b[38;2;226;232;240m' + data.answer + '\x1b[0m');
        if (data.model) {
          term.writeln(`\x1b[38;2;100;116;139m└ ${data.model} · ${data.latencyMs}ms · ${data.usage?.promptTokens || 0}+${data.usage?.completionTokens || 0} tokens\x1b[0m`);
        }
      } else if (data.type === 'terminal:error') {
        term.writeln('\x1b[38;2;248;113;113m✗ ' + (data.message || 'command failed') + '\x1b[0m');
      } else if (data.code) {
        term.writeln(data.code);
      } else if (data.scores) {
        term.writeln('\x1b[38;2;52;211;153mENGINEERING SCORECARD\x1b[0m');
        for (const [k, v] of Object.entries(data.scores as Record<string, number>)) {
          term.writeln(`  ${k.padEnd(15)} ${v}%`);
        }
        term.writeln(`\x1b[38;2;52;211;153m  OVERALL: ${data.overall}%\x1b[0m`);
      } else if (data.percentComplete !== undefined) {
        term.writeln(`\x1b[38;2;96;165;250mRoadmap: ${data.percentComplete}% · ${data.shipped}/${data.total} shipped\x1b[0m`);
      } else if (data.type) {
        const text = JSON.stringify(data);
        term.writeln(text.length > 400 ? text.slice(0, 400) + '…' : text);
      }
    } catch (e) {
      term.writeln('\x1b[38;2;248;113;113m✗ network error: ' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px solid #1e293b', background: '#020617' }}>
      <div
        onClick={onToggleCollapse}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          cursor: 'pointer', fontSize: 10, color: '#64748b', background: '#0f172a',
          fontFamily: 'ui-monospace, monospace', userSelect: 'none',
        }}
      >
        <span style={{ color: '#34d399' }}>{collapsed ? '▸' : '▾'}</span>
        <span style={{ color: '#34d399', fontWeight: 700 }}>AGENT TERMINAL</span>
        <span>· xterm.js</span>
        <span style={{ flex: 1 }} />
        <span>/help for commands</span>
      </div>
      {!collapsed && (
        <div
          ref={containerRef}
          style={{
            height,
            width: '100%',
            background: '#020617',
            padding: '4px 2px',
            overflow: 'hidden',
          }}
        />
      )}
    </div>
  );
}

export default AgentTerminal;
