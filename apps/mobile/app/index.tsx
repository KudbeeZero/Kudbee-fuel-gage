import { View, Text, ScrollView, StyleSheet } from 'react-native';
import DashboardCard from '../components/DashboardCard';

const cards = [
  { id: '1', title: 'TR-Core', status: 'Operational', updatedAt: '2 min ago' },
  { id: '2', title: 'Hermes Agent', status: 'Active', updatedAt: '1 min ago' },
  { id: '3', title: 'Vector Store', status: 'Syncing', updatedAt: '5 min ago' },
  { id: '4', title: 'Redis Cluster', status: 'Healthy', updatedAt: 'Just now' },
];

export default function DashboardScreen() {
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
});
