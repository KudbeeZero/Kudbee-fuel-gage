/**
 * DTHINK Pipeline Contracts
 * Canonical TypeScript interfaces for the Distributed THINK pipeline.
 * All agents conform to these types. Violations = contract breach.
 */

/* ── Entry types ─────────────────────────────────── */

export type DThinkEntryType =
  | 'command:exec'      // A slash command was executed
  | 'agent:action'      // A terminal agent performed an action
  | 'agent:decision'    // A terminal agent made a decision
  | 'agent:recall'      // A snippet/pattern was recalled
  | 'agent:call'        // A phone call was made
  | 'agent:voicemail'   // A voicemail was left
  | 'bus:event'         // A serial bus event was published
  | 'cache:invalidate'  // A cache entry was invalidated
  | 'think:inject'      // A think token was injected
  | 'system:health'     // A health check result
  | 'system:sync'       // A terminal↔UI sync was performed
  | 'human:handoff';    // A human-in-the-loop handoff

/* ── Contract severity ────────────────────────────── */

export type DThinkSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

/* ── Entry payload (what gets stored) ─────────────── */

export interface DThinkEntry {
  /** Unique ID — uuid v4 */
  id: string;

  /** Entry type from the enum above */
  type: DThinkEntryType;

  /** Agent that produced this entry */
  agentId: string;

  /** Timestamp in ISO 8601 */
  timestamp: string;

  /** Severity level */
  severity: DThinkSeverity;

  /** The command or action that triggered this */
  trigger: string;

  /** Human-readable summary */
  summary: string;

  /** Optional structured data payload */
  data?: Record<string, unknown>;

  /** Optional contract version */
  contractVersion?: string;
}

/* ── Pipeline snapshot ─────────────────────────────── */

export interface DThinkSnapshot {
  /** Timestamp of snapshot */
  timestamp: string;

  /** Total entries processed */
  totalEntries: number;

  /** Entries by type */
  byType: Record<string, number>;

  /** Entries by agent */
  byAgent: Record<string, number>;

  /** Most recent entries (last 10) */
  recent: DThinkEntry[];

  /** Stream size in bytes */
  streamSizeBytes: number;

  /** Is the stream healthy */
  healthy: boolean;
}

/* ── Contracts (rules all agents must follow) ──────── */

export const DTHINK_CONTRACTS = {
  /** Every command execution MUST produce a DThinkEntry */
  RULE_COMMAND_FEED: 'Every /command execution produces a DThinkEntry with type "command:exec"',

  /** Every agent action MUST produce a DThinkEntry */
  RULE_AGENT_FEED: 'Every agent action (run, decide, recall, call) produces a corresponding entry',

  /** All entries MUST have a valid id, timestamp, and agentId */
  RULE_VALID_ENTRY: 'All entries have: id (uuid), timestamp (ISO 8601), agentId (non-empty)',

  /** Severity MUST match the entry type — no silent errors */
  RULE_SEVERITY: 'CRITICAL entries trigger BUS→CACHE flush. ERROR entries logged to bus. WARN entries logged locally.',

  /** Other agents MUST NOT mutate another agent's entries */
  RULE_IMMUTABILITY: 'Entries are append-only and immutable once written',

  /** The stream MUST NOT exceed 500 entries — auto-compact at threshold */
  RULE_COMPACTION: 'Stream limited to 500 entries. Auto-compaction keeps last 300 and writes summary entry.',
} as const;
