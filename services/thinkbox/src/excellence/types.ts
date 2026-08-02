/**
 * THINKBOX PR-012 — Engineering Excellence Types
 */

export interface AgentDailyReview {
  agent: string;
  date: string;
  status: 'healthy' | 'degraded' | 'offline';
  domain: string;
  findings: string[];
  recommendations: string[];
  metrics: Record<string, number>;
  confidence: number;
}

export interface DailyEngineeringReview {
  date: string;
  missionHealth: { active: number; completed: number; blocked: number };
  agentReviews: AgentDailyReview[];
  qualityScore: number;
  architectureScore: number;
  risks: string[];
  topRecommendations: string[];
  generatedAt: string;
}

export interface ExcellenceScore {
  date: string;
  total: number;
  trend: number[];
  breakdown: {
    architecture: { score: number; maxScore: number; issues: string[] };
    frontend: { score: number; maxScore: number; issues: string[] };
    backend: { score: number; maxScore: number; issues: string[] };
    typescript: { score: number; maxScore: number; issues: string[] };
    testing: { score: number; maxScore: number; issues: string[] };
    documentation: { score: number; maxScore: number; issues: string[] };
    learning: { score: number; maxScore: number; issues: string[] };
    agentCollaboration: { score: number; maxScore: number; issues: string[] };
    ux: { score: number; maxScore: number; issues: string[] };
    performance: { score: number; maxScore: number; issues: string[] };
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendations: string[];
}

export interface TypeScriptAudit {
  date: string;
  strictMode: boolean;
  noImplicitAny: boolean;
  typeCoverage: number;
  sharedContracts: { frontend: number; backend: number };
  exhaustiveSwitches: number;
  duplicateTypes: string[];
  apiTyped: number;
  eventTyped: number;
  viewModelTyped: boolean;
  issues: string[];
  score: number;
  grade: string;
}
