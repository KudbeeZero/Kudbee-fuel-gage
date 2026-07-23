import type { OSPlugin } from '../../core/pluginRegistry';

const LiveTelemetryPlugin: OSPlugin = {
  id: 'live-telemetry',
  name: 'Live Telemetry',
  description: 'Real-time telemetry ingestion and monitoring',
  icon: 'activity',
  category: 'telemetry',
  component: () => null,
  defaultRoute: '/os/live-telemetry',
};
export default LiveTelemetryPlugin;
