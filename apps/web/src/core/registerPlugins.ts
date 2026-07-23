import { registerPlugin } from '../core/pluginRegistry';
import AgenticRagPlugin from '../plugins/AgenticRag';
import VectorStorePlugin from '../plugins/VectorStore';
import LiveTelemetryPlugin from '../plugins/LiveTelemetry';
import CommunityLedgerPlugin from '../plugins/CommunityLedger';

registerPlugin(AgenticRagPlugin);
registerPlugin(VectorStorePlugin);
registerPlugin(LiveTelemetryPlugin);
registerPlugin(CommunityLedgerPlugin);
