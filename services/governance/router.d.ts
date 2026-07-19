export interface ProposedAction {
  id: string;
  action: string;
  tags: string[];
  prompt?: string;
  status: 'PROPOSED' | 'PROVEN';
  created_at: string;
  proven_at?: string;
}

export function matchLogic(prompt: string): Promise<{
  matched: boolean;
  route: 'FAST_BRAIN' | 'SLOW_BRAIN';
  confidence?: number;
  reason?: string;
  logic?: ProposedAction;
}>;

export function listProposed(): Promise<ProposedAction[]>;
export function proposeAction(input: {
  action: string;
  tags?: string[];
  prompt?: string;
  id?: string;
}): Promise<ProposedAction>;
export function approveAction(id: string): Promise<ProposedAction | null>;
export function rejectAction(id: string): Promise<ProposedAction | null>;
export function registerTag(def: { tag: string; keywords: string[]; weight?: number }): void;

export const router: {
  matchLogic: typeof matchLogic;
  listProposed: typeof listProposed;
  proposeAction: typeof proposeAction;
  approveAction: typeof approveAction;
  rejectAction: typeof rejectAction;
  registerTag: typeof registerTag;
  redisEnabled: boolean;
};

export default router;
