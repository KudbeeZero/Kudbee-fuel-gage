import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { useCommandStore } from '../store/useCommandStore';
import { mobileCommandRunners } from '../sdk/commands';

const commands = [
  { label: 'System Probe', runner: mobileCommandRunners.systemProbe },
  { label: 'Hermes Audit', runner: mobileCommandRunners.hermesAudit },
  { label: 'Clear Triage', runner: mobileCommandRunners.clearTriage },
  { label: 'Telemetry Purge', runner: mobileCommandRunners.telemetryPurge },
  { label: 'Crucible Dispatch', runner: mobileCommandRunners.crucibleDispatch },
  { label: 'Vector Resync', runner: mobileCommandRunners.resyncVector },
  { label: 'Bulk Approve', runner: mobileCommandRunners.governanceBulkApprove },
  { label: 'Dictionary Lookup', runner: mobileCommandRunners.dictionaryLookup },
];

export default function TerminalScreen() {
  const storeCommands = useCommandStore((s) => s.commands);
  const [query, setQuery] = useState('');

  const runMemoryRecall = () => {
    if (!query.trim()) return;
    mobileCommandRunners.memoryRecall(query.trim());
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Terminal</Text>
      <Text style={styles.subheading}>Dispatch commands to the backend</Text>
      <View style={styles.grid}>
        {commands.map((cmd) => (
          <Pressable
            key={cmd.label}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => cmd.runner()}
          >
            <Text style={styles.buttonLabel}>{cmd.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.memoryRow}>
        <TextInput
          style={styles.input}
          placeholder="Memory query…"
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.runButton} onPress={runMemoryRecall}>
          <Text style={styles.runLabel}>Run</Text>
        </Pressable>
      </View>
      {storeCommands.length > 0 && (
        <>
          <Text style={styles.section}>Output</Text>
          {storeCommands.slice(0, 10).map((cmd) => (
            <View key={cmd.id} style={styles.logRow}>
              <Text style={styles.logLabel}>{cmd.label}</Text>
              <Text
                style={[
                  styles.logDetail,
                  cmd.state === 'FAILED' && styles.error,
                ]}
              >
                {cmd.detail || cmd.state}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
  },
  memoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#334155',
  },
  runButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  section: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 12,
    marginBottom: 4,
  },
  logRow: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  logLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  logDetail: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  error: {
    color: '#ef4444',
  },
});
