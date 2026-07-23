import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

const ACTIONS = [
  { id: 'approve-1', title: 'Approve Logic Pair', status: 'PENDING' as const },
  { id: 'approve-2', title: 'Promote HERMES Rule', status: 'PENDING' as const },
  { id: 'review-1', title: 'Review Crucible Output', status: 'FAILED' as const },
];

export default function GovernanceScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Governance</Text>
      <Text style={styles.subtitle}>Human-in-the-loop approvals and policy state</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending Actions</Text>
        {ACTIONS.map((item) => (
          <TouchableOpacity key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={[styles.badge, item.status === 'PENDING' ? styles.badgePending : styles.badgeFailed]}>
                <Text style={[styles.badgeText, item.status === 'PENDING' ? styles.badgeTextPending : styles.badgeTextFailed]}>
                  {item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>ID: {item.id}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f9fafb',
    flex: 1,
  },
  cardMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgePending: {
    backgroundColor: '#78350f',
  },
  badgeFailed: {
    backgroundColor: '#7f1d1d',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeTextPending: {
    color: '#fbbf24',
  },
  badgeTextFailed: {
    color: '#fca5a5',
  },
});
