import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useCommandStore } from '../src/store/useCommandStore';
import { hermesAudit, crucibleDispatch, systemProbe, memoryRecall, telemetryPurge, governanceBulkApprove } from '../src/sdk/commands';

const COMMANDS = [
  { label: 'hermes', run: hermesAudit },
  { label: 'crucible', run: crucibleDispatch },
  { label: 'probe', run: systemProbe },
  { label: 'recall', run: () => memoryRecall() },
  { label: 'purge', run: telemetryPurge },
  { label: 'approve', run: governanceBulkApprove },
];

export default function TerminalScreen() {
  const logs = useCommandStore((s) => s.logs);
  const addLog = useCommandStore((s) => s.addLog);
  const { width } = useWindowDimensions();
  const cols = width > 600 ? 3 : 2;

  const runCommand = async (label: string, fn: () => Promise<{ success: boolean; detail?: string }>) => {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terminal</Text>
        <Text style={styles.headerSubtitle}>Agent stream and command dispatch</Text>
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Quick Run</Text>
        <View style={[styles.toolbarRow, cols === 3 && styles.toolbarRow3]}>
          {COMMANDS.map((c) => (
            <TouchableOpacity key={c.label} style={styles.chip} onPress={() => runCommand(c.label, c.run)}>
              <Text style={styles.chipText}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.output} contentContainerStyle={styles.outputContent}>
        {logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <Text style={[styles.logState, log.state === 'SUCCESS' && styles.logSuccess, log.state === 'FAILED' && styles.logFailed]}>[{log.state}]</Text>
            <Text style={styles.logLabel}>{log.label}</Text>
            <Text style={styles.logDetail}>{log.detail}</Text>
            <Text style={styles.logTime}>{log.time}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f9fafb',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
  },
  toolbar: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    gap: 8,
  },
  toolbarLabel: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolbarRow3: {},
  chip: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: 16,
    gap: 8,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 4,
  },
  logState: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 12,
    minWidth: 70,
  },
  logSuccess: {
    color: '#34d399',
  },
  logFailed: {
    color: '#f87171',
  },
  logLabel: {
    color: '#f9fafb',
    fontSize: 13,
    minWidth: 100,
  },
  logDetail: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 12,
  },
  logTime: {
    color: '#6b7280',
    fontSize: 11,
  },
});
