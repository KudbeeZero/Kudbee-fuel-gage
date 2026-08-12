import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { mobileCommandRunners } from '../src/sdk/commands';
import { useCommandStore } from '../src/store/useCommandStore';
import { apiGet } from '../src/lib/apiClient';

type Session = {
  id: string;
  title: string;
  agent: string;
  status: 'WORKING' | 'WAITING' | 'PAUSED';
  summary: string;
};

const seedSessions: Session[] = [
  { id: 'ops', title: 'Staging reliability pass', agent: 'DeepSeek V4', status: 'WORKING', summary: 'Checking the queue handoff before release.' },
  { id: 'product', title: 'Workspace interaction model', agent: 'Qwen 3.6 Pro', status: 'WAITING', summary: 'Ready for the next product decision.' },
  { id: 'memory', title: 'THINK evidence review', agent: 'Hermes', status: 'PAUSED', summary: 'Comparing decisions with the current gates.' },
];

interface LiveState {
  health: 'loading' | 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  fleetCount: number;
  pendingCount: number;
  pgLatencyMs: number;
  redisLatencyMs: number;
  error: string | null;
}

export default function WorkspaceScreen() {
  const [sessions, setSessions] = useState(seedSessions);
  const [activeId, setActiveId] = useState(seedSessions[0]!.id);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<LiveState>({
    health: 'loading',
    fleetCount: 0,
    pendingCount: 0,
    pgLatencyMs: 0,
    redisLatencyMs: 0,
    error: null,
  });
  const commands = useCommandStore((state) => state.commands);
  const active = useMemo(() => sessions.find((session) => session.id === activeId) ?? sessions[0]!, [activeId, sessions]);

  useEffect(() => {
    let cancelled = false;
    const loadLiveState = async () => {
      try {
        const [health, fleet, pending] = await Promise.allSettled([
          apiGet<{ status?: string; services?: Record<string, { status: string; latencyMs: number }> }>('/api/system/health-deep'),
          apiGet<{ fleet?: unknown[]; count?: number }>('/api/agents/fleet'),
          apiGet<unknown>('/api/governance/pending'),
        ]);
        if (cancelled) return;
        const next: LiveState = { ...live, error: null };

        if (health.status === 'fulfilled') {
          const h = health.value;
          next.health = h.status === 'HEALTHY' ? 'HEALTHY' : 'DEGRADED';
          next.pgLatencyMs = h.services?.postgres?.latencyMs ?? 0;
          next.redisLatencyMs = h.services?.redis?.latencyMs ?? 0;
        } else {
          next.health = 'OFFLINE';
          next.error = 'Health probe failed';
        }

        if (fleet.status === 'fulfilled') {
          next.fleetCount = fleet.value?.count ?? (Array.isArray(fleet.value?.fleet) ? fleet.value.fleet.length : 0);
        }

        if (pending.status === 'fulfilled') {
          const p = pending.value;
          const items = Array.isArray(p) ? p : (p as { pending?: unknown[] })?.pending;
          next.pendingCount = Array.isArray(items) ? items.length : 0;
        }

        setLive(next);
      } catch {
        if (!cancelled) setLive((prev) => ({ ...prev, health: 'OFFLINE', error: 'Live fetch failed' }));
      }
    };
    loadLiveState();
    const timer = setInterval(loadLiveState, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const continueSession = () => {
    if (!draft.trim()) return;
    setSessions((current) => current.map((session) => session.id === active.id ? { ...session, status: 'WORKING', summary: draft.trim() } : session));
    mobileCommandRunners.terminalExecute(draft.trim());
    setDraft('');
  };

  const attentionItems = [
    ...(live.pendingCount > 0 ? [{ title: `${live.pendingCount} approval${live.pendingCount === 1 ? '' : 's'} need review`, copy: 'Open Governance to inspect pending agent decisions.', age: 'LIVE' }] : []),
    ...(live.health === 'DEGRADED' || live.health === 'OFFLINE' ? [{ title: 'Staging needs attention', copy: `Health probe returned ${live.health.toLowerCase()}. Open Terminal for diagnostics.`, age: 'LIVE' }] : []),
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} accessible={true} accessibilityLabel="Workspace dashboard">
      <View style={styles.eyebrowRow}>
        <Text style={styles.eyebrow}>SHARED WORKSPACE</Text>
        <View style={[styles.livePill, live.health === 'HEALTHY' && styles.livePillGreen, live.health === 'DEGRADED' && styles.livePillYellow, live.health === 'OFFLINE' && styles.livePillRed]}>
          <View style={[styles.liveDot, live.health === 'OFFLINE' && styles.liveDotRed]} />
          <Text style={[styles.liveText, live.health === 'OFFLINE' && styles.liveTextRed]}>
            {live.health === 'loading' ? 'CONNECTING…' : live.health === 'HEALTHY' ? 'ONLINE' : live.health}
          </Text>
        </View>
      </View>
      <Text style={styles.heading}>Lemonade desk</Text>
      <Text style={styles.subheading}>Pick up the work, see what needs attention, and keep the context together.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sessionStrip} accessibilityLabel="Session tabs">
        {sessions.map((session) => (
          <Pressable key={session.id} onPress={() => setActiveId(session.id)} style={[styles.sessionTab, active.id === session.id && styles.sessionTabActive]} accessibilityRole="tab" accessibilityState={{ selected: active.id === session.id }} accessibilityLabel={`${session.title} by ${session.agent}, ${session.status}`}>
            <View style={[styles.sessionDot, session.status === 'WORKING' ? styles.dotWorking : session.status === 'WAITING' ? styles.dotWaiting : styles.dotPaused]} />
            <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionAgent}>{session.agent}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.hero} accessibilityLabel="Active session card">
        <View style={styles.heroGlow} />
        <Text style={styles.heroKicker}>{active.status === 'WORKING' ? 'AGENT IS IN MOTION' : 'READY WHEN YOU ARE'}</Text>
        <Text style={styles.heroTitle}>{active.summary}</Text>
        <Text style={styles.heroCopy}>The session stays resumable when you leave. Live staging health is {live.health.toLowerCase()}.</Text>
        <View style={styles.metaRow}>
          <Text style={styles.statusBadge}>{active.status}</Text>
          <Text style={styles.metaText}>{active.agent}</Text>
        </View>
        <Pressable onPress={() => router.push('/terminal')} style={styles.terminalButton} accessibilityRole="button" accessibilityLabel="Open agent terminal">
          <Text style={styles.terminalButtonText}>Open agent terminal</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow} accessibilityLabel={`Staging status: ${live.fleetCount} agents, PG ${live.pgLatencyMs}ms, Redis ${live.redisLatencyMs}ms`}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{live.fleetCount}</Text>
          <Text style={styles.statLabel}>Agents</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{live.pgLatencyMs}ms</Text>
          <Text style={styles.statLabel}>Postgres</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{live.redisLatencyMs}ms</Text>
          <Text style={styles.statLabel}>Redis</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Continue the thread</Text><Text style={styles.sectionHint}>Type a slash command or instruction for the terminal.</Text></View></View>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} multiline numberOfLines={3} placeholder="/swarm status" placeholderTextColor="#64748b" style={styles.input} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Command input" />
        <Pressable onPress={continueSession} disabled={!draft.trim()} style={[styles.continueButton, !draft.trim() && styles.buttonDisabled]} accessibilityRole="button" accessibilityLabel="Send command to terminal">
          <Text style={styles.continueText}>Send to terminal</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your attention</Text><Text style={styles.sectionHint}>Live signals from the online workspace.</Text></View><Text style={styles.count}>{attentionItems.length}</Text></View>
      {attentionItems.length === 0 && <View style={styles.attentionHealthy}><Text style={styles.attentionTitle}>No urgent signals</Text><Text style={styles.attentionCopy}>Staging health is healthy and no approvals are waiting.</Text></View>}
      {attentionItems.map((item) => (
        <View key={item.title} style={styles.attentionCard} accessibilityLabel={`Alert: ${item.title}. ${item.copy}`}>
          <Text style={styles.attentionTitle}>{item.title}</Text>
          <Text style={styles.attentionCopy}>{item.copy}</Text>
          <Text style={styles.attentionAge}>{item.age}</Text>
        </View>
      ))}

      {live.error && <Text style={styles.errorText}>{live.error}</Text>}

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent movement</Text><Text style={styles.sectionHint}>Actions remain visible after you switch tabs.</Text></View></View>
      {commands.slice(0, 3).map((command) => <View key={command.id} style={styles.commandRow} accessibilityLabel={`Command ${command.label}: ${command.state}`}><Text numberOfLines={1} style={styles.commandLabel}>{command.label}</Text><Text style={styles.commandState}>{command.state}</Text></View>)}
      {commands.length === 0 && <Pressable onPress={() => mobileCommandRunners.systemProbe()} style={styles.probeButton} accessibilityRole="button" accessibilityLabel="Run system probe"><Text style={styles.probeText}>Run a safe system probe</Text></Pressable>}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#08110f' },
  screen: { flex: 1, backgroundColor: '#08110f' },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#8be9b7', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: '#23483a', borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  livePillGreen: { borderColor: '#3e9b6c' },
  livePillYellow: { borderColor: '#f6c85f' },
  livePillRed: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#8be9b7' },
  liveDotRed: { backgroundColor: '#ef4444' },
  liveText: { color: '#8be9b7', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  liveTextRed: { color: '#fca5a5' },
  heading: { color: '#f3f7f2', fontSize: 32, fontWeight: '700', marginTop: 4 },
  subheading: { color: '#8ca39a', fontSize: 14, lineHeight: 21, maxWidth: 340 },
  sessionStrip: { gap: 8, paddingVertical: 6 },
  sessionTab: { width: 185, backgroundColor: '#101d19', borderColor: '#1c322a', borderWidth: 1, borderRadius: 12, padding: 12 },
  sessionTabActive: { backgroundColor: '#112b21', borderColor: '#3e9b6c' },
  sessionDot: { width: 7, height: 7, borderRadius: 7, marginBottom: 10 },
  dotWorking: { backgroundColor: '#8be9b7' }, dotWaiting: { backgroundColor: '#f6c85f' }, dotPaused: { backgroundColor: '#a78bfa' },
  sessionTitle: { color: '#e4eee8', fontSize: 13, fontWeight: '600' }, sessionAgent: { color: '#6d857a', fontSize: 11, marginTop: 5 },
  hero: { overflow: 'hidden', backgroundColor: '#12271f', borderColor: '#285940', borderWidth: 1, borderRadius: 18, padding: 20, position: 'relative' },
  heroGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 140, backgroundColor: '#58d894', opacity: 0.08, right: -45, top: -50 },
  heroKicker: { color: '#8be9b7', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  heroTitle: { color: '#f3f7f2', fontSize: 23, lineHeight: 30, fontWeight: '700', marginTop: 14 },
  heroCopy: { color: '#9eb7aa', fontSize: 13, lineHeight: 20, marginTop: 12 },
  terminalButton: { alignSelf: 'flex-start', backgroundColor: '#8be9b7', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, marginTop: 17 },
  terminalButtonText: { color: '#0c2519', fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }, statusBadge: { color: '#0c2519', backgroundColor: '#8be9b7', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: '800' }, metaText: { color: '#86a295', fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: '#101d19', borderColor: '#1c322a', borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { color: '#8be9b7', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#6d857a', fontSize: 10, marginTop: 3, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, sectionTitle: { color: '#e4eee8', fontSize: 16, fontWeight: '700' }, sectionHint: { color: '#6d857a', fontSize: 11, marginTop: 4 }, count: { color: '#f6c85f', backgroundColor: '#40351b', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700' },
  composer: { backgroundColor: '#0d1915', borderColor: '#23483a', borderWidth: 1, borderRadius: 14, padding: 12 }, input: { color: '#e4eee8', minHeight: 72, textAlignVertical: 'top', fontSize: 14, lineHeight: 21 }, continueButton: { alignSelf: 'flex-end', backgroundColor: '#8be9b7', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 }, buttonDisabled: { opacity: 0.35 }, continueText: { color: '#0c2519', fontSize: 12, fontWeight: '800' },
  attentionCard: { backgroundColor: '#2f2816', borderColor: '#5d4c25', borderWidth: 1, borderRadius: 13, padding: 14 }, attentionTitle: { color: '#f6e7b4', fontSize: 13, fontWeight: '700' }, attentionCopy: { color: '#a59b79', fontSize: 12, lineHeight: 18, marginTop: 6 }, attentionAge: { color: '#a58d4a', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 12 },
  attentionHealthy: { backgroundColor: '#102b22', borderColor: '#2d6b4b', borderWidth: 1, borderRadius: 13, padding: 14 },
  errorText: { color: '#fca5a5', fontSize: 11, marginTop: 4 },
  commandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#101d19', borderColor: '#1c322a', borderWidth: 1, borderRadius: 10, padding: 12 }, commandLabel: { color: '#dbe8df', flex: 1, fontSize: 12, marginRight: 10 }, commandState: { color: '#8be9b7', fontSize: 10, fontWeight: '800' }, probeButton: { borderColor: '#3e9b6c', borderWidth: 1, borderRadius: 10, padding: 13, alignItems: 'center' }, probeText: { color: '#8be9b7', fontSize: 12, fontWeight: '700' },
});
