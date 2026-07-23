import { useState, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface AuditExportState {
  format: 'json' | 'csv';
  provider: string;
  status: string;
  from: string;
  to: string;
}

function convertToCsv(data: Record<string, unknown>): string {
  const items = Array.isArray(data) ? data : (data as Record<string, unknown[]>).data || [];
  if (items.length === 0) return '';
  const headers = Object.keys(items[0] as Record<string, unknown>);
  const rows = [headers.join(',')];
  for (const item of items) {
    const row = headers.map((h) => {
      const val = String((item as Record<string, unknown>)[h] ?? '');
      return val.includes(',') ? `\"${val.replace(/\"/g, '\"\"')}\"` : val;
    });
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

export function useAuditExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AuditExportState>({
    format: 'json',
    provider: '',
    status: '',
    from: '',
    to: ''
  });
  const [lastHash, setLastHash] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof AuditExportState>(key: K, value: AuditExportState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const triggerExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('format', state.format);
      if (state.provider) params.set('provider', state.provider);
      if (state.status) params.set('status', state.status);
      if (state.from) params.set('from', state.from);
      if (state.to) params.set('to', state.to);

      const data = await apiGet<Record<string, unknown>>(`/api/audit/export?${params.toString()}`);
      const content = state.format === 'csv' ? convertToCsv(data) : JSON.stringify(data, null, 2);
      const mimeType = state.format === 'csv' ? 'text/csv' : 'application/json';

      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.${state.format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setLastHash(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [state]);

  return { state, updateField, triggerExport, exporting, error, lastHash };
}
