import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileCommandRunners } from '../sdk/commands';
import { useCommandStore } from '../store/useCommandStore';

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

export default function WorkspaceScreen() {
  const [sessions, setSessions] = useState(seedSessions);
  const [activeId, setActiveId] = useState(seedSessions[0].id);
  const [draft, setDraft] = useState('');
  const commands = useCommandStore((state) => state.commands);
  const active = useMemo(() => sessions.find((session) => session.id === activeId) ?? sessions[0], [activeId, sessions]);

  const continueSession = () => {
    if (!draft.trim()) return;
    setSessions((current) => current.map((session) => session.id === active.id ? { ...session, status: 'WORKING', summary: draft.trim() } : session));
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>SHARED WORKSPACE</Text><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL-FIRST</Text></View></View>
      <Text style={styles.heading}>Lemonade desk</Text>
      <Text style={styles.subheading}>Pick up the work, see what needs attention, and keep the context together.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sessionStrip}>
        {sessions.map((session) => (
          <Pressable key={session.id} onPress={() => setActiveId(session.id)} style={[styles.sessionTab, active.id === session.id && styles.sessionTabActive]}>
            <View style={[styles.sessionDot, session.status === 'WORKING' ? styles.dotWorking : session.status === 'WAITING' ? styles.dotWaiting : styles.dotPaused]} />
            <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionAgent}>{session.agent}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.heroKicker}>{active.status === 'WORKING' ? 'AGENT IS IN MOTION' : 'READY WHEN YOU ARE'}</Text>
        <Text style={styles.heroTitle}>{active.summary}</Text>
        <Text style={styles.heroCopy}>The session stays resumable when you leave. No silent handoffs, no disappearing context.</Text>
        <View style={styles.metaRow}><Text style={styles.statusBadge}>{active.status}</Text><Text style={styles.metaText}>{active.agent}</Text></View>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Continue the thread</Text><Text style={styles.sectionHint}>Add context or make the next decision.</Text></View></View>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} multiline numberOfLines={3} placeholder="What should happen next?" placeholderTextColor="#64748b" style={styles.input} />
        <Pressable onPress={continueSession} disabled={!draft.trim()} style={[styles.continueButton, !draft.trim() && styles.buttonDisabled]}><Text style={styles.continueText}>Continue</Text></Pressable>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your attention</Text><Text style={styles.sectionHint}>Three small next moves.</Text></View><Text style={styles.count}>3</Text></View>
      <View style={styles.attentionCard}><Text style={styles.attentionTitle}>One approval needs your decision</Text><Text style={styles.attentionCopy}>Gastown outcome is waiting in the governance queue.</Text><Text style={styles.attentionAge}>2 MIN AGO</Text></View>
      <View style={[styles.attentionCard, styles.attentionBlue]}><Text style={styles.attentionTitle}>Staging is running degraded</Text><Text style={styles.attentionCopy}>Redis is unavailable locally; durability is being checked.</Text><Text style={styles.attentionAge}>5 MIN AGO</Text></View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent movement</Text><Text style={styles.sectionHint}>Actions remain visible after you switch tabs.</Text></View></View>
      {commands.slice(0, 3).map((command) => <View key={command.id} style={styles.commandRow}><Text numberOfLines={1} style={styles.commandLabel}>{command.label}</Text><Text style={styles.commandState}>{command.state}</Text></View>)}
      {commands.length === 0 && <Pressable onPress={() => mobileCommandRunners.systemProbe()} style={styles.probeButton}><Text style={styles.probeText}>Run a safe system probe</Text></Pressable>}
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
  liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#8be9b7' },
  liveText: { color: '#8be9b7', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }, statusBadge: { color: '#0c2519', backgroundColor: '#8be9b7', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: '800' }, metaText: { color: '#86a295', fontSize: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, sectionTitle: { color: '#e4eee8', fontSize: 16, fontWeight: '700' }, sectionHint: { color: '#6d857a', fontSize: 11, marginTop: 4 }, count: { color: '#f6c85f', backgroundColor: '#40351b', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700' },
  composer: { backgroundColor: '#0d1915', borderColor: '#23483a', borderWidth: 1, borderRadius: 14, padding: 12 }, input: { color: '#e4eee8', minHeight: 72, textAlignVertical: 'top', fontSize: 14, lineHeight: 21 }, continueButton: { alignSelf: 'flex-end', backgroundColor: '#8be9b7', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 }, buttonDisabled: { opacity: 0.35 }, continueText: { color: '#0c2519', fontSize: 12, fontWeight: '800' },
  attentionCard: { backgroundColor: '#2f2816', borderColor: '#5d4c25', borderWidth: 1, borderRadius: 13, padding: 14 }, attentionBlue: { backgroundColor: '#10252b', borderColor: '#1f5660' }, attentionTitle: { color: '#f6e7b4', fontSize: 13, fontWeight: '700' }, attentionCopy: { color: '#a59b79', fontSize: 12, lineHeight: 18, marginTop: 6 }, attentionAge: { color: '#a58d4a', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 12 },
  commandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#101d19', borderColor: '#1c322a', borderWidth: 1, borderRadius: 10, padding: 12 }, commandLabel: { color: '#dbe8df', flex: 1, fontSize: 12, marginRight: 10 }, commandState: { color: '#8be9b7', fontSize: 10, fontWeight: '800' }, probeButton: { borderColor: '#3e9b6c', borderWidth: 1, borderRadius: 10, padding: 13, alignItems: 'center' }, probeText: { color: '#8be9b7', fontSize: 12, fontWeight: '700' },
});
