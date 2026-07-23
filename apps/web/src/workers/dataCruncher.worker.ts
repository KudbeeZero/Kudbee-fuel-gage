/**
 * Web Worker: data crunching for large telemetry logs, token counting.
 * Offloaded from main thread to prevent UI blocking.
 */
self.onmessage = (e: MessageEvent<{ task: string; payload: unknown; id: string }>) => {
  const { task, payload, id } = e.data;
  try {
    let result: unknown;
    if (task === 'count_tokens') {
      const logs = payload as Array<{ tokens_in?: number; tokens_out?: number }>;
      const total = logs.reduce((s, l) => s + (l.tokens_in || 0) + (l.tokens_out || 0), 0);
      result = { total, count: logs.length };
    } else if (task === 'sort_by_cost') {
      const logs = payload as Array<{ cost?: number; model?: string; timestamp?: string }>;
      const sorted = [...logs].sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, 50);
      result = sorted;
    } else if (task === 'parse_jsonl') {
      const text = payload as string;
      const lines = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      result = { parsed: lines.length, lines };
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
