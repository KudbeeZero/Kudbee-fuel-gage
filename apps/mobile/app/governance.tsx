import { View, Text, StyleSheet } from 'react-native';

export default function GovernanceScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Governance</Text>
      <Text style={styles.hint}>Pending actions and audit logs will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#475569',
  },
});
