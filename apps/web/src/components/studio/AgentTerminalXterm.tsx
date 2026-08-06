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
  const thinkingRef = useRef(false);

  // ── Command registry (drives /help + tab completion) ──
  const COMMANDS: Record<string, string> = {
    '/status': 'Fleet + shield status', '/swarm': 'Agent tree', '/shield': 'P·L·R·I shield',
    '/roadmap': 'Phase roadmap', '/pulse': 'Engineering health', '/health': 'Dependency health',
    '/security': 'Security posture', '/echo': 'Prompt library', '/forecast': 'Failure forecast',
    '/agents': 'Agent fleet', '/ask': 'Ask Gemini (or fallback)', '/code': 'Generate code',
    '/handoff': 'Session handoff', '/help': 'Show commands', '/clear': 'Clear screen',
    '/guardian': 'Repo guardian', '/crypto': 'Crypto runtime', '/invariants': 'Security invariants',
    '/scorecard': 'Engineering scorecard', '/middleware': 'Middleware health',
  };

  const promptStr = () => '\x1b[38;2;52;211;153mkudbee@os\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ ';

  function completeCommand() {
    const term = termRef.current;
    if (!term) return;
    const v = bufferRef.current;
    const m = v.match(/^(\/[a-z-]*)$/i);
    if (!m) return;
    const matches = Object.keys(COMMANDS).filter((c) => c.toLowerCase().startsWith(v.toLowerCase()));
    if (matches.length === 1) {
      bufferRef.current = matches[0] + ' ';
      term.write('\x1b[2K\r' + promptStr() + bufferRef.current);
    } else if (matches.length > 1) {
      term.writeln('\r\n\x1b[38;2;100;116;139m' + matches.join('   ') + '\x1b[0m');
      term.write('\x1b[2K\r' + promptStr() + bufferRef.current);
    }
  }

  function showThinking() {
    const term = termRef.current;
    if (!term || thinkingRef.current) return;
    thinkingRef.current = true;
    term.write('\r\n\x1b[38;2;245;158;11m… processing\x1b[0m');
  }
  function hideThinking() {
    const term = termRef.current;
    if (!term || !thinkingRef.current) return;
    thinkingRef.current = false;
    term.write('\r\x1b[2K');
  }

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
    term.writeln('\x1b[38;2;100;116;139mEngineering OS v2.4.1 · xterm.js engine\x1b[0m');
    term.writeln('\x1b[38;2;100;116;139mType /help for commands · Tab to complete · Ctrl+K palette · ↑↓ history\x1b[0m');
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
        term.write(promptStr());
      } else if (data === '\x7f' || data === '\b') {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\t') { // tab completion
        completeCommand();
      } else if (data === '\x1b[A') { // up
        if (histIdxRef.current > 0) {
          histIdxRef.current--;
          bufferRef.current = historyRef.current[histIdxRef.current] || '';
          term.write('\x1b[2K\r' + promptStr() + bufferRef.current);
        }
      } else if (data === '\x1b[B') { // down
        if (histIdxRef.current < historyRef.current.length) {
          histIdxRef.current++;
          bufferRef.current = historyRef.current[histIdxRef.current] || '';
          term.write('\x1b[2K\r' + promptStr() + bufferRef.current);
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

    // ── Local commands (no server round-trip) ──
    const local = cmd.toLowerCase();
    if (local === '/clear') {
      term.write('\x1b[2J\x1b[H');
      term.writeln('\x1b[38;2;52;211;153mKUDBEE AGENT TERMINAL\x1b[0m');
      term.writeln('\x1b[38;2;100;116;139mType /help · Tab to complete · ↑↓ history\x1b[0m');
      term.write(promptStr());
      return;
    }
    if (local === '/help' || local === 'help' || local === '?') {
      const lines = Object.entries(COMMANDS).map(([c, d]) => `  ${c.padEnd(12)} ${d}`).join('\r\n');
      term.writeln('\x1b[38;2;52;211;153mCOMMANDS\x1b[0m\r\n' + lines);
      term.write(promptStr());
      return;
    }

    try {
      showThinking();
      const res = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      hideThinking();

      if (data.answer) {
        term.writeln('\x1b[38;2;226;232;240m' + data.answer + '\x1b[0m');
        if (data.model) {
          term.writeln(`\x1b[38;2;100;116;139m└ ${data.model} · ${data.latencyMs}ms · ${data.usage?.promptTokens || 0}+${data.usage?.completionTokens || 0} tokens\x1b[0m`);
        }
      } else if (data.type === 'terminal:error') {
        const msg = data.message || 'command failed';
        term.writeln('\x1b[38;2;248;113;113m✗ ' + msg + '\x1b[0m');
        // Suggest similar commands on unknown-command errors.
        const sm = String(msg).match(/unknown command:? ?\/?([a-z-]+)/i);
        if (sm) {
          const partial = sm[1].slice(0, 4);
          const sug = Object.keys(COMMANDS).filter((c) => c.includes(partial));
          if (sug.length) term.writeln('\x1b[38;2;100;116;139mDid you mean: ' + sug.join(', ') + ' ?\x1b[0m');
        }
      } else if (data.code) {
        term.writeln('\x1b[38;2;96;165;250m' + data.code + '\x1b[0m');
        if (data.model) term.writeln(`\x1b[38;2;100;116;139m└ generated by ${data.model}\x1b[0m`);
      } else if (data.scores) {
        term.writeln('\x1b[38;2;52;211;153mENGINEERING SCORECARD\x1b[0m');
        for (const [k, v] of Object.entries(data.scores as Record<string, number>)) {
          term.writeln(`  ${k.padEnd(15)} ${v}%`);
        }
        term.writeln(`\x1b[38;2;52;211;153m  OVERALL: ${data.overall}%\x1b[0m`);
      } else if (data.percentComplete !== undefined) {
        term.writeln(`\x1b[38;2;96;165;250mRoadmap: ${data.percentComplete}% · ${data.shipped}/${data.total} shipped\x1b[0m`);
      } else if (data.type) {
        // Full structured response, pretty-printed — no 400-char truncation.
        const { type: _t, timestamp: _ts, ...rest } = data;
        const keys = Object.keys(rest);
        if (keys.length && keys.length <= 10) {
          term.writeln('\x1b[38;2;52;211;153m' + String(data.type).replace('terminal:', '').toUpperCase() + '\x1b[0m');
          for (const k of keys) {
            const v = rest[k];
            const vs = typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v);
            term.writeln(`  \x1b[38;2;96;165;250m${k}\x1b[0m: ${vs}`);
          }
        } else {
          term.writeln(JSON.stringify(data, null, 1));
        }
      }
    } catch (e) {
      hideThinking();
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
        <span>· xterm.js · v2.4.1</span>
        <span style={{ flex: 1 }} />
        <span>/help · Tab ⭾ · ↑↓ · Ctrl+L</span>
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
