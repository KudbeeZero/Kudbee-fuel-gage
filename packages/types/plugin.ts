export type PluginStatus = 'active' | 'degraded' | 'offline' | 'pending' | 'standby';
export type PluginCategory = 'storm' | 'stream' | 'storage' | 'trajectories' | 'governance' | 'metric' | 'adapter' | 'auditor';

export interface GridSpan {
  colSpan: number;
  rowSpan?: number;
}

export interface IKudbeePlugin {
  id: string;
  title: string;
  category: PluginCategory;
  status: PluginStatus;
  gridSpan: GridSpan;
  // Future-proofing for when plugins need specific permissions
  requiresApprovalGate?: boolean;
}
