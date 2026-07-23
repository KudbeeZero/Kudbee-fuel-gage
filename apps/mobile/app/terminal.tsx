import { View, Text, StyleSheet } from 'react-native';

export default function TerminalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>$</Text>
      <Text style={styles.hint}>Command terminal coming in PR 5.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
  },
  prompt: {
    fontSize: 16,
    color: '#38bdf8',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 14,
    color: '#475569',
    marginTop: 8,
  },
});
