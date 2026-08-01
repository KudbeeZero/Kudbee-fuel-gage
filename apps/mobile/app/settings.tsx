import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Switch } from 'react-native';
import { mobileCommandRunners } from '../src/sdk/commands';

export default function SettingsScreen() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  const handlePurge = async () => {
    setShowConfirmDialog(false);
    const result = await mobileCommandRunners.telemetryPurge();
    setPurgeResult(result.detail ?? 'Purge dispatched');
  };

  return (
    <View style={styles.container} accessible={true} accessibilityLabel="Settings screen">
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.hint}>Runtime config and preferences</Text>

      <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Settings controls">
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Display</Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Reduced motion</Text>
              <Text style={styles.rowHint}>Minimize animations and transitions</Text>
            </View>
            <Switch
              value={reducedMotion}
              onValueChange={setReducedMotion}
              trackColor={{ false: '#334155', true: '#8be9b7' }}
              thumbColor={reducedMotion ? '#0c2519' : '#94a3b8'}
              accessibilityLabel="Reduced motion toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: reducedMotion }}
            />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>Data</Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Purge telemetry ledger</Text>
              <Text style={styles.rowHint}>Remove all telemetry traces (irreversible)</Text>
            </View>
            {showConfirmDialog ? (
              <View style={styles.confirmRow}>
                <Pressable onPress={handlePurge} style={styles.confirmYes} accessibilityRole="button" accessibilityLabel="Confirm purge telemetry">
                  <Text style={styles.confirmYesText}>Yes, purge</Text>
                </Pressable>
                <Pressable onPress={() => setShowConfirmDialog(false)} style={styles.confirmNo} accessibilityRole="button" accessibilityLabel="Cancel purge">
                  <Text style={styles.confirmNoText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setShowConfirmDialog(true)} style={styles.purgeButton} accessibilityRole="button" accessibilityLabel="Purge telemetry data">
                <Text style={styles.purgeText}>Purge</Text>
              </Pressable>
            )}
          </View>
          {purgeResult && <Text style={styles.resultText}>{purgeResult}</Text>}
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>System</Text>
          <Pressable onPress={() => { mobileCommandRunners.systemProbe(); }} style={styles.actionRow} accessibilityRole="button" accessibilityLabel="Run health check">
            <Text style={styles.actionLabel}>Run health check</Text>
            <Text style={styles.actionArrow}>→</Text>
          </Pressable>
          <Pressable onPress={() => { mobileCommandRunners.resyncVector(); }} style={styles.actionRow} accessibilityRole="button" accessibilityLabel="Resync vector store">
            <Text style={styles.actionLabel}>Resync vector store</Text>
            <Text style={styles.actionArrow}>→</Text>
          </Pressable>
          <Pressable onPress={() => { mobileCommandRunners.clearTriage(); }} style={styles.actionRow} accessibilityRole="button" accessibilityLabel="Clear triage queue">
            <Text style={styles.actionLabel}>Clear triage queue</Text>
            <Text style={styles.actionArrow}>→</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 4 },
  hint: { fontSize: 14, color: '#475569', marginBottom: 16 },
  content: { gap: 20, paddingBottom: 40 },
  group: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 14 },
  groupTitle: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  rowHint: { color: '#64748b', fontSize: 11, marginTop: 3 },
  purgeButton: { backgroundColor: '#7f1d1d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  purgeText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
  confirmRow: { flexDirection: 'row', gap: 6 },
  confirmYes: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  confirmYesText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  confirmNo: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  confirmNoText: { color: '#f8fafc', fontSize: 11, fontWeight: '600' },
  resultText: { color: '#8be9b7', fontSize: 11, marginTop: 8 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopColor: '#334155', borderTopWidth: 1 },
  actionLabel: { color: '#f8fafc', fontSize: 13, fontWeight: '500' },
  actionArrow: { color: '#475569', fontSize: 16 },
});
