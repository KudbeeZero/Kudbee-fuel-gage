import { lazy } from 'react';
import type { OSPlugin } from '../../core/pluginRegistry';

const Component = lazy(() => import('../../components/AgenticRack'));

const AgenticRagPlugin: OSPlugin = {
  id: 'agentic-rag',
  name: 'Agentic Rack',
  description: 'DAW-style 12-column plugin motherboard',
  icon: 'cpu',
  category: 'core',
  component: Component,
  defaultRoute: '/os/agentic-rag',
};

export default AgenticRagPlugin;
