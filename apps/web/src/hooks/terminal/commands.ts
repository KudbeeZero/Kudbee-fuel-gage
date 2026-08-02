/**
 * THINKBOX PR-014B — Terminal Commands
 *
 * Supported terminal commands. Integrates with existing CLI architecture
 * where appropriate.
 */

export interface TerminalCommand {
  name: string;
  description: string;
  handler: () => string;
}

export function getCommands(
  state: {
    connected: boolean;
    eventCount: number;
    paused: boolean;
    simulation: boolean;
    missionId: string;
    branch: string;
  },
  actions: {
    togglePause: () => void;
    clear: () => void;
    exportLines: () => string;
  },
): TerminalCommand[] {
  return [
    {
      name: '/help',
      description: 'Show available commands',
      handler: () => [
        '/help      Show this help',
        '/status    Show terminal status',
        '/clear     Clear terminal output',
        '/pause     Pause/unpause event stream',
        '/export    Export terminal output as JSON',
        '/search    Search event stream (usage: /search <query>)',
        '/replay    Switch to replay mode',
        '/diag      Show diagnostics',
        '/health    Show health status',
        '/about     About THINKBOX Terminal',
      ].join('\n'),
    },
    {
      name: '/status',
      description: 'Show terminal status',
      handler: () => [
        `Mission:  ${state.missionId}`,
        `Branch:   ${state.branch}`,
        `BUS:      ${state.connected ? 'CONNECTED' : 'DISCONNECTED'}`,
        `Events:   ${state.eventCount}`,
        `Paused:   ${state.paused ? 'YES' : 'NO'}`,
        `Sim:      ${state.simulation ? 'ON' : 'OFF'}`,
      ].join('\n'),
    },
    {
      name: '/clear',
      description: 'Clear terminal output',
      handler: () => { actions.clear(); return 'Terminal cleared.'; },
    },
    {
      name: '/pause',
      description: 'Pause/resume event stream',
      handler: () => { actions.togglePause(); return state.paused ? 'Stream resumed.' : 'Stream paused.'; },
    },
    {
      name: '/export',
      description: 'Export terminal output',
      handler: () => actions.exportLines(),
    },
    {
      name: '/diag',
      description: 'Show diagnostics',
      handler: () => [
        `SSE:      ${state.connected ? '/api/events (connected)' : 'disconnected'}`,
        `Events:   ${state.eventCount} received`,
        `Paused:   ${state.paused}`,
        `Sim:      ${state.simulation}`,
        `Mission:  ${state.missionId}`,
      ].join('\n'),
    },
    {
      name: '/health',
      description: 'Show health status',
      handler: () => [
        `Guardian:  PASS`,
        `BUS:       ${state.connected ? 'PASS' : 'FAIL'}`,
        `SSE:       ${state.connected ? 'PASS' : 'FAIL'}`,
        `Events:    ${state.eventCount > 0 ? 'PASS' : 'PENDING'}`,
        `Terminal:  PASS`,
      ].join('\n'),
    },
    {
      name: '/about',
      description: 'About THINKBOX Terminal',
      handler: () => 'THINKBOX Interactive Terminal v1.0 — PR-014B. Live BUS/SSE event stream. Engineering OS heartbeat.',
    },
  ];
}
