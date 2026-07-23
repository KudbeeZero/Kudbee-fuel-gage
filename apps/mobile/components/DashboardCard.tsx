import { View, Text, StyleSheet } from 'react-native';

type Props = {
  title: string;
  body: string;
  variant?: 'info' | 'success' | 'warning';
};

export default function DashboardCard({ title, body, variant = 'info' }: Props) {
  return (
    <View style={[styles.card, variant === 'success' && styles.cardSuccess, variant === 'warning' && styles.cardWarning]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardSuccess: {
    borderColor: '#065f46',
  },
  cardWarning: {
    borderColor: '#92400e',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
  },
});
