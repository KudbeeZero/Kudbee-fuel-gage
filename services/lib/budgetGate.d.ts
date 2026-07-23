declare module './budgetGate.js' {
  export class BudgetExceededError extends Error {
    statusCode: number;
    constructor(spendUsd: number, budgetUsd: number);
  }

  export function getMonthlyBudgetUsd(): number;
  export function trackSpend(costUsd: number): Promise<void>;
  export function getCurrentSpend(): Promise<number>;
  export function checkBudgetOrThrow(tokensIn: number, tokensOut: number, model: string): Promise<void>;
  export function estimateGroqCost(tokensUsed: number): number;
  export function getBudgetStatus(): Promise<{
    spendUsd: number;
    budgetUsd: number;
    remainingUsd: number;
    pct: number;
    monthReset: string;
  }>;
}

export {};
