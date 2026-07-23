import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  status: string;
  updatedAt: string;
}

export default function DashboardCard({ title, status, updatedAt }: Props) {
  const statusColor = status === 'Healthy' || status === 'Operational' || status === 'Active'
    ? '#22c55e'
    : status === 'Syncing'
      ? '#f59e0b'
      : '#ef4444';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
      </View>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.meta}>Updated {updatedAt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  status: {
    fontSize: 14,
    color: '#cbd5e1',
  },
  meta: {
    fontSize: 12,
    color: '#64748b',
  },
});
