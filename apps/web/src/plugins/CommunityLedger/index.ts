import type { OSPlugin } from '../../core/pluginRegistry';

const CommunityLedgerPlugin: OSPlugin = {
  id: 'community-ledger',
  name: 'Community Ledger',
  description: 'Cost tracking and community value metrics',
  icon: 'dollar-sign',
  category: 'ledger',
  component: () => null,
  defaultRoute: '/os/community-ledger',
};
export default CommunityLedgerPlugin;
