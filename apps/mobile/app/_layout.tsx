import { Tabs } from 'expo-router';
import { Text, StyleSheet, useColorScheme } from 'react-native';

function TabIcon({ symbol, label }: { symbol: string; label: string }) {
  return <Text style={styles.icon} accessibilityLabel={label}>{symbol}</Text>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          borderTopColor: isDark ? '#334155' : '#e2e8f0',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarAccessibilityLabel: 'Workspace dashboard',
          tabBarIcon: () => <TabIcon symbol="⌂" label="Dashboard" />,
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: 'Terminal',
          tabBarAccessibilityLabel: 'Agent terminal',
          tabBarIcon: () => <TabIcon symbol=">" label="Terminal" />,
        }}
      />
      <Tabs.Screen
        name="governance"
        options={{
          title: 'Governance',
          tabBarAccessibilityLabel: 'Governance approvals',
          tabBarIcon: () => <TabIcon symbol="◎" label="Governance" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Mobile settings',
          tabBarIcon: () => <TabIcon symbol="⚙" label="Settings" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  icon: { fontSize: 16, textAlign: 'center' },
});
