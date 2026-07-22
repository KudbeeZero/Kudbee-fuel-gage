// services/governance/ledger.d.ts
export interface ReasoningEntry {
  context: string;
  input: Record<string, unknown>;
  thoughtStream: unknown[];
  output: Record<string, unknown>;
  resultStatus: { status: string; code: string | null; reason: string | null };
  provider?: string;
  event_type?: string;
  reason?: string;
  created_at: string;
}

export interface LedgerRecordReasoning {
  (input: Record<string, unknown>, output: Record<string, unknown>, resultStatus: string | Record<string, unknown>, provider?: string, event_type?: string, reason?: string): Promise<{ stored: string; id?: number; queued?: string }>;
}

export interface LedgerLogSystemReset {
  (reason: string, service?: string): Promise<{ stored: string; id?: number; queued?: string }>;
}

export interface Ledger {
  recordReasoning: LedgerRecordReasoning;
  logSystemReset: LedgerLogSystemReset;
  ensureLedgerSchema(): Promise<void>;
  drainQueue(): Promise<void>;
}

export const ledger: Ledger;
export const recordReasoning: LedgerRecordReasoning;
export const logSystemReset: LedgerLogSystemReset;
export const ensureLedgerSchema: () => Promise<void>;
export default ledger;
