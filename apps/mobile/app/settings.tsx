import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

const ROWS = [
  { label: 'API URL', value: 'http://localhost:9900' },
  { label: 'Runtime', value: 'Expo 52 / React 18' },
  { label: 'Status', value: 'Connected' },
  { label: 'Theme', value: 'Midnight' },
];

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        {ROWS.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Clear Local Cache</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonDanger]}>
        <Text style={[styles.buttonText, styles.buttonTextDanger]}>Reset App State</Text>
      </TouchableOpacity>
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
  section: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  label: {
    fontSize: 14,
    color: '#9ca3af',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f9fafb',
  },
  button: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDanger: {
    backgroundColor: '#7f1d1d',
  },
  buttonText: {
    color: '#f9fafb',
    fontWeight: '600',
    fontSize: 15,
  },
  buttonTextDanger: {
    color: '#fca5a5',
  },
});
