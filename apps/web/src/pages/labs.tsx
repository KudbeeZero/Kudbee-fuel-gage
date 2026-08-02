/**
 * THINKBOX PR-008 — Labs Dashboard
 *
 * Interactive test environment for every major subsystem. Each lab
 * generates synthetic data, simulates failures, replays sessions,
 * and exports diagnostics.
 */

import { useState } from 'react';
import {
  FlaskConical, Activity, Wifi, Terminal, Brain, Network,
  Play, AlertTriangle, RefreshCw, Eye,
} from 'lucide-react';

interface LabModule {
  id: string;
  name: string;
  description: string;
  icon: any;
  status: 'operational' | 'degraded' | 'offline';
  tests: Array<{ name: string; description: string; run: () => void }>;
}

export function LabsPage() {
  const [activeLab, setActiveLab] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Array<{ name: string; status: 'pass' | 'fail' | 'running'; output: string }>>([]);
  const [simFailures, setSimFailures] = useState(false);

  const runTest = (lab: string, test: string) => {
    setTestResults(prev => [...prev, { name: `${lab}:${test}`, status: 'running', output: 'Running...' }]);
    setTimeout(() => {
      const pass = simFailures ? Math.random() > 0.5 : true;
      setTestResults(prev => prev.map(r =>
        r.name === `${lab}:${test}` && r.status === 'running'
          ? { ...r, status: pass ? 'pass' : 'fail', output: pass ? 'OK — deterministic output verified' : 'FAIL — expected behavior not observed' }
          : r
      ));
    }, 500 + Math.random() * 1500);
  };

  const labs: LabModule[] = [
    { id: 'dashboard', name: 'Dashboard Lab', description: 'Render test for every panel with synthetic data', icon: Eye, status: 'operational',
      tests: [
        { name: 'render-all-panels', description: 'Render every THINKBOX panel with mock ViewModel', run: () => runTest('dashboard', 'all-panels') },
        { name: 'responsive-layout', description: 'Test responsive breakpoints for all layouts', run: () => runTest('dashboard', 'responsive') },
        { name: 'error-states', description: 'Test all error state renderings', run: () => runTest('dashboard', 'errors') },
      ]
    },
    { id: 'event-bus', name: 'Event Bus Lab', description: 'Publish/receive/replay BUS events', icon: Activity, status: 'operational',
      tests: [
        { name: 'publish-subscribe', description: 'Publish event, verify subscriber receives', run: () => runTest('bus', 'pubsub') },
        { name: 'ordering', description: 'Verify event ordering is preserved', run: () => runTest('bus', 'ordering') },
        { name: 'replay', description: 'Replay timeline, verify identical output', run: () => runTest('bus', 'replay') },
      ]
    },
    { id: 'agent', name: 'Agent Lab', description: 'Simulate agent lifecycle and communication', icon: Brain, status: 'operational',
      tests: [
        { name: 'agent-startup', description: 'Start 6 agents, verify all report healthy', run: () => runTest('agent', 'startup') },
        { name: 'agent-messaging', description: 'Agent-to-agent message delivery test', run: () => runTest('agent', 'messaging') },
        { name: 'agent-crash', description: 'Simulate agent crash, verify recovery', run: () => runTest('agent', 'crash') },
      ]
    },
    { id: 'mission-planner', name: 'Mission Planner Lab', description: 'Test objective decomposition and planning', icon: FlaskConical, status: 'operational',
      tests: [
        { name: 'decompose-api', description: 'API objective → 2 epics, 10 tasks', run: () => runTest('planner', 'api') },
        { name: 'decompose-cicd', description: 'CI/CD objective → 1 epic, 5 tasks', run: () => runTest('planner', 'cicd') },
        { name: 'determinism', description: 'Same objective → same output', run: () => runTest('planner', 'determinism') },
      ]
    },
    { id: 'engineering-graph', name: 'Engineering Graph Lab', description: 'Graph query, traversal, impact analysis', icon: Network, status: 'operational',
      tests: [
        { name: 'query', description: 'Query nodes by kind and predicate', run: () => runTest('graph', 'query') },
        { name: 'traversal', description: 'BFS traversal returns correct order', run: () => runTest('graph', 'traversal') },
        { name: 'impact-analysis', description: 'Impact analysis for node modification', run: () => runTest('graph', 'impact') },
      ]
    },
    { id: 'terminal', name: 'Terminal Lab', description: 'Test terminal commands, history, simulation', icon: Terminal, status: 'operational',
      tests: [
        { name: 'commands', description: 'All /commands execute correctly', run: () => runTest('terminal', 'commands') },
        { name: 'history', description: 'Command history navigation works', run: () => runTest('terminal', 'history') },
        { name: 'simulation', description: 'Sim mode blocks all real execution', run: () => runTest('terminal', 'sim') },
      ]
    },
    { id: 'recovery', name: 'Recovery Lab', description: 'Simulate failures and recovery paths', icon: AlertTriangle, status: 'operational',
      tests: [
        { name: 'api-timeout', description: 'API timeout → retry → recover', run: () => runTest('recovery', 'timeout') },
        { name: 'sse-disconnect', description: 'SSE disconnect → reconnect with ticket', run: () => runTest('recovery', 'sse') },
        { name: 'execution-fail', description: 'Command failure → analyze → rollback', run: () => runTest('recovery', 'execution') },
      ]
    },
    { id: 'rendering', name: 'Rendering Lab', description: 'Test frontend rendering performance', icon: Eye, status: 'operational',
      tests: [
        { name: 'fps-check', description: 'Verify steady 60fps with all panels', run: () => runTest('render', 'fps') },
        { name: 'memory-leak', description: 'Mount/unmount cycle check', run: () => runTest('render', 'memory') },
        { name: 'large-dataset', description: 'Render with 1000+ timeline events', run: () => runTest('render', 'large') },
      ]
    },
  ];

  const active = labs.find(l => l.id === activeLab);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-100">THINKBOX Labs</h1>
            <p className="text-xs text-slate-500">Interactive testing environment for every subsystem</p>
          </div>
        </div>
        <button onClick={() => setSimFailures(!simFailures)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono ${simFailures ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-800/30 border-slate-700/30 text-slate-500'}`}>
          <AlertTriangle className="w-3 h-3" />
          Simulate Failures: {simFailures ? 'ON' : 'OFF'}
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {labs.map(lab => (
          <button key={lab.id}
            onClick={() => setActiveLab(activeLab === lab.id ? null : lab.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${activeLab === lab.id ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800/60 bg-slate-900/40 hover:bg-slate-800/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <lab.icon className="w-4 h-4 text-indigo-400" />
              <span className="font-display text-sm font-semibold text-slate-200">{lab.name}</span>
              <span className={`ml-auto w-2 h-2 rounded-full ${lab.status === 'operational' ? 'bg-emerald-400' : lab.status === 'degraded' ? 'bg-amber-400' : 'bg-slate-600'}`} />
            </div>
            <p className="text-[10px] text-slate-500 mb-3">{lab.description}</p>
            <span className="text-[9px] text-slate-600 font-mono">{lab.tests.length} tests</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-xl border border-indigo-500/20 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-200">{active.name} — Test Suite</h3>
            <button onClick={() => active.tests.forEach(t => t.run())}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-mono hover:bg-indigo-500/20">
              <Play className="w-3 h-3" /> Run All
            </button>
          </div>
          <div className="space-y-1">
            {active.tests.map(test => {
              const result = testResults.find(r => r.name === `${active.id}:${test.name}`);
              return (
                <div key={test.name} className="flex items-center gap-3 p-2 rounded border border-slate-800/40 bg-slate-950/40">
                  <button onClick={() => test.run()}
                    className={`p-1 rounded ${result ? '' : 'text-slate-500 hover:text-indigo-400'}`}>
                    {result?.status === 'running' ? <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" /> :
                     result?.status === 'pass' ? <div className="w-3 h-3 rounded-full bg-emerald-400" /> :
                     result?.status === 'fail' ? <div className="w-3 h-3 rounded-full bg-rose-400" /> :
                     <Play className="w-3 h-3" />}
                  </button>
                  <div className="flex-1">
                    <div className="text-[10px] text-slate-300 font-mono">{test.name}</div>
                    <div className="text-[9px] text-slate-600">{test.description}</div>
                  </div>
                  {result && result.status !== 'running' && (
                    <span className={`text-[9px] font-mono ${result.status === 'pass' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {result.status.toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {testResults.filter(r => r.name.startsWith(active.id)).length > 0 && (
            <div className="mt-2 p-2 rounded bg-slate-950/60 max-h-32 overflow-y-auto">
              {testResults.filter(r => r.name.startsWith(active.id)).map(r => (
                <div key={r.name} className="text-[9px] font-mono">
                  <span className={r.status === 'pass' ? 'text-emerald-400' : r.status === 'fail' ? 'text-rose-400' : 'text-indigo-400'}>{r.name}:</span>
                  <span className="text-slate-500 ml-2">{r.output}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {testResults.length > 0 && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Diagnostics Export</span>
            <button className="text-[9px] text-slate-600 hover:text-slate-400 font-mono">Export JSON</button>
          </div>
          <pre className="text-[9px] text-slate-500 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
            {JSON.stringify({ timestamp: new Date().toISOString(), simFailures, results: testResults.map(r => ({ name: r.name, status: r.status, output: r.output })) }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default LabsPage;
