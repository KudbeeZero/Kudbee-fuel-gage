// Import directly from the root package to clear the compiler error
import { IKudbeePlugin } from '@kudbee/types';

export const CORE_RACK_PLUGINS: Record<string, IKudbeePlugin> = {
  'plugin-storm': {
    id: 'plugin-storm',
    title: 'THINK: STORM',
    category: 'storm',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  'plugin-stream': {
    id: 'plugin-stream',
    title: 'THINK: STREAM',
    category: 'stream',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  'plugin-storage': {
    id: 'plugin-storage',
    title: 'THINK: STORAGE',
    category: 'storage',
    status: 'active',
    gridSpan: { colSpan: 4 }
  },
  'plugin-gov-gate': {
    id: 'plugin-gov-gate',
    title: 'GOVERNANCE: APPROVAL GATE',
    category: 'governance',
    status: 'pending',
    gridSpan: { colSpan: 8 }
  },
  'plugin-hermes-auditor': {
    id: 'plugin-hermes-auditor',
    title: 'HERMES: AUDITOR',
    category: 'auditor',
    status: 'active',
    gridSpan: { colSpan: 4 }
  }
};
