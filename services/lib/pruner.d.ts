declare module './pruner.js' {
  export function runSystemPruner(): Promise<{
    governanceTasks: number;
    governanceDlq: number;
    slowJobs: number;
  }>;
}

export {};
