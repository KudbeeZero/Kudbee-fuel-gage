import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import DashboardCard from '../components/DashboardCard';
import { useCommandStore } from '../src/store/useCommandStore';
import { hermesAudit, systemProbe } from '../src/sdk/commands';

const ACTIONS = [
  { label: 'Hermes Audit', run: hermesAudit },
  { label: 'System Probe', run: systemProbe },
];

export default function DashboardScreen() {
  const logs = useCommandStore((s) => s.logs);
  const addLog = useCommandStore((s) => s.addLog);
  const { width } = useWindowDimensions();
  const cols = width > 600 ? 2 : 1;

  const handle = async (label: string, fn: () => Promise<{ success: boolean; detail?: string }>) => {
    addLog({ label, state: 'RUNNING' });
    try {
      const res = await fn();
      addLog({ label, state: res.success ? 'SUCCESS' : 'FAILED', detail: res.detail });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog({ label, state: 'FAILED', detail: msg });
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>System overview and quick actions</Text>

      <View style={styles.grid}>
        <DashboardCard title="Hermes Audit" body="Trigger sweep" variant="info" />
        <DashboardCard title="CPU Usage" body="42%" variant="success" />
        <DashboardCard title="Memory" body="6.2 / 16 GB" variant="warning" />
        <DashboardCard title="Telemetry" body="1.2k traces/hr" variant="info" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={[styles.actionRow, cols === 2 && styles.actionRowCols2]}>
          {ACTIONS.map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionButton} onPress={() => handle(a.label, a.run)}>
              <Text style={styles.actionText}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {logs.length === 0 && <Text style={styles.empty}>No commands run yet.</Text>}
        {logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <Text style={[styles.logState, log.state === 'SUCCESS' && styles.logSuccess, log.state === 'FAILED' && styles.logFailed]}>[{log.state}]</Text>
            <Text style={styles.logLabel}>{log.label}</Text>
            <Text style={styles.logDetail}>{log.detail}</Text>
            <Text style={styles.logTime}>{log.time}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, gap: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#f9fafb' },
  subtitle: { fontSize: 14, color: '#9ca3af' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#e5e7eb' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionRowCols2: { flexWrap: 'wrap' },
  actionButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 140,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { color: '#6b7280', fontSize: 13 },
  logRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
  logState: { color: '#9ca3af', fontWeight: '700', fontSize: 12, minWidth: 70 },
  logSuccess: { color: '#34d399' },
  logFailed: { color: '#f87171' },
  logLabel: { color: '#e5e7eb', fontSize: 13, minWidth: 120 },
  logDetail: { flex: 1, color: '#9ca3af', fontSize: 12 },
  logTime: { color: '#6b7280', fontSize: 11 },
});
