declare module './pruner.js' {
  export function acquirePrunerLock(): Promise<boolean>;
  export function releasePrunerLock(): Promise<void>;
  export function runSystemPruner(): Promise<{
    governanceTasks: number;
    governanceDlq: number;
    slowJobs: number;
    locked: boolean;
  }>;
}

export {};
