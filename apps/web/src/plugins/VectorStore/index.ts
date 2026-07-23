import type { OSPlugin } from '../../core/pluginRegistry';

const VectorStorePlugin: OSPlugin = {
  id: 'vector-store',
  name: 'Vector Store',
  description: 'pgvector memory store and similarity search',
  icon: 'database',
  category: 'memory',
  component: () => null,
  defaultRoute: '/os/vector-store',
};
export default VectorStorePlugin;
