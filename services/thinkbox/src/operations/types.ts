/**
 * THINKBOX PR-011 — Alpha Operations Types
 *
 * Daily engineering mode types. No new engines — just making THINKBOX
 * the primary workspace for its own development.
 */

export interface TodaysMission {
  date: string;
  activeMission: {
    id: string;
    title: string;
    objective: string;
    status: string;
    progress: number;
    assignedAgents: string[];
    nextTask: string | null;
  } | null;
  blockers: Array<{ id: string; description: string; severity: string; agent: string }>;
  pendingApprovals: Array<{ id: string; command: string; level: string; requestedAt: string }>;
  changesSinceYesterday: string[];
  whatsNext: string[];
}

export interface MissionInboxItem {
  id: string;
  source: 'roadmap' | 'github-issue' | 'technical-debt' | 'learning' | 'feedback' | 'ci-failure';
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  estimatedEffort: 'small' | 'medium' | 'large' | 'x-large';
  dependencies: string[];
  suggestedAgent: string;
  confidence: number;
  status: 'new' | 'triaged' | 'planned' | 'in-progress' | 'done';
  url: string | null;
}

export interface SessionContext {
  lastOpened: string;
  previousMission: string | null;
  terminalHistory: string[];
  timelinePosition: number;
  activeAgents: string[];
  engineeringGraphFocus: string | null;
  memoryRefs: string[];
}

export interface EngineeringJournalEntry {
  date: string;
  missionsCompleted: string[];
  filesChanged: string[];
  decisionsMade: string[];
  risksIdentified: string[];
  learnings: string[];
  recommendations: string[];
  pendingApprovals: string[];
  summary: string;
}

export interface TechnicalDebtItem {
  id: string;
  source: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  evidence: string;
  created: string;
  status: 'open' | 'acknowledged' | 'in-progress' | 'resolved';
  linkedMission: string | null;
}

export interface ProductAnalytics {
  date: string;
  sessionLength: number;
  panelsOpened: Record<string, number>;
  timeSpentPlanning: number;
  timeSpentExecuting: number;
  replaySessionsWatched: number;
  learningRecordsReviewed: number;
  approvalCount: number;
  missionCount: number;
}

export interface AlphaFeedback {
  id: string;
  category: 'ui-ux' | 'planning' | 'execution' | 'learning' | 'performance' | 'bug';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  recommendation: string | null;
  submittedAt: string;
  status: 'new' | 'reviewed' | 'accepted' | 'implemented';
  fedTolearning: boolean;
}
