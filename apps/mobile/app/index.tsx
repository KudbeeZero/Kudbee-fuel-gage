import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import DashboardCard from '../components/DashboardCard';
import { useCommandStore } from '../store/useCommandStore';
import { mobileCommandRunners } from '../sdk/commands';

const cards = [
  { id: '1', title: 'TR-Core', status: 'Operational', updatedAt: '2 min ago' },
  { id: '2', title: 'Hermes Agent', status: 'Active', updatedAt: '1 min ago' },
  { id: '3', title: 'Vector Store', status: 'Syncing', updatedAt: '5 min ago' },
  { id: '4', title: 'Redis Cluster', status: 'Healthy', updatedAt: 'Just now' },
];

const quickActions = [
  { label: 'System Probe', runner: mobileCommandRunners.systemProbe },
  { label: 'Hermes Audit', runner: mobileCommandRunners.hermesAudit },
  { label: 'Memory Recall', runner: mobileCommandRunners.memoryRecall },
  { label: 'Crucible Dispatch', runner: mobileCommandRunners.crucibleDispatch },
];

export default function DashboardScreen() {
  const commands = useCommandStore((s) => s.commands);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Dashboard</Text>
      <Text style={styles.subheading}>Real-time system status</Text>
      {cards.map((card) => (
        <DashboardCard
          key={card.id}
          title={card.title}
          status={card.status}
          updatedAt={card.updatedAt}
        />
      ))}
      <Text style={styles.section}>Quick Actions</Text>
      <View style={styles.actionGrid}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => action.runner()}
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      {commands.length > 0 && (
        <>
          <Text style={styles.section}>Recent Commands</Text>
          {commands.slice(0, 5).map((cmd) => (
            <View key={cmd.id} style={styles.commandRow}>
              <Text style={styles.commandLabel}>{cmd.label}</Text>
              <Text
                style={[
                  styles.commandState,
                  cmd.state === 'SUCCESS'
                    ? styles.success
                    : cmd.state === 'FAILED'
                      ? styles.error
                      : styles.pending,
                ]}
              >
                {cmd.state}
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
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  section: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: 8,
    marginBottom: 4,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionLabel: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
  },
  commandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  commandLabel: {
    color: '#f8fafc',
    fontSize: 14,
  },
  commandState: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  success: {
    color: '#22c55e',
  },
  error: {
    color: '#ef4444',
  },
  pending: {
    color: '#f59e0b',
  },
});
