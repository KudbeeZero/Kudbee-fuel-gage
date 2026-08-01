import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { apiGet, apiPost } from '../src/lib/apiClient';

interface GovernanceItem {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
}

export default function GovernanceScreen() {
  const [items, setItems] = useState<GovernanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Set<string>>(new Set());

  const loadPending = async () => {
    try {
      setError(null);
      const pending = await apiGet<unknown>('/api/governance/pending');
      const list = Array.isArray(pending) ? pending : (pending as { pending?: GovernanceItem[] })?.pending ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load governance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
    const timer = setInterval(loadPending, 30_000);
    return () => clearInterval(timer);
  }, []);

  const handleApprove = async (id: string) => {
    setApproving((prev) => new Set(prev).add(id));
    try {
      await apiPost('/api/governance/approve', { id });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApproving((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleReject = async (id: string) => {
    setRejecting((prev) => new Set(prev).add(id));
    try {
      await apiPost('/api/governance/reject', { id });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setRejecting((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  return (
    <View style={styles.container} accessible={true} accessibilityLabel="Governance screen">
      <Text style={styles.heading}>Governance</Text>
      <Text style={styles.hint}>{items.length > 0 ? `${items.length} pending action${items.length === 1 ? '' : 's'}` : 'No pending actions'}</Text>

      {error && (
        <View style={styles.errorBanner} accessibilityLabel={`Error: ${error}`}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadPending} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry loading governance">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {loading && <ActivityIndicator color="#8be9b7" style={styles.spinner} accessibilityLabel="Loading governance data" />}

      {!loading && items.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptyCopy}>No pending governance actions require your attention.</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list} accessibilityLabel="Governance action list">
        {items.map((item) => (
          <View key={item.id} style={styles.card} accessibilityLabel={`Governance action: ${item.title || item.id}`}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardPriority}>{item.priority || 'PENDING'}</Text>
              <Text style={styles.cardAge}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title || item.id}</Text>
            {item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => handleApprove(item.id)}
                disabled={approving.has(item.id) || rejecting.has(item.id)}
                style={[styles.actionBtn, styles.approveBtn]}
                accessibilityRole="button"
                accessibilityLabel={`Approve ${item.title || item.id}`}
              >
                <Text style={styles.approveText}>{approving.has(item.id) ? '…' : 'Approve'}</Text>
              </Pressable>
              <Pressable
                onPress={() => handleReject(item.id)}
                disabled={approving.has(item.id) || rejecting.has(item.id)}
                style={[styles.actionBtn, styles.rejectBtn]}
                accessibilityRole="button"
                accessibilityLabel={`Reject ${item.title || item.id}`}
              >
                <Text style={styles.rejectText}>{rejecting.has(item.id) ? '…' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 4 },
  hint: { fontSize: 14, color: '#475569', marginBottom: 12 },
  spinner: { marginTop: 24 },
  errorBanner: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 12 },
  retryButton: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#1e293b', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { color: '#f8fafc', fontSize: 11, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: '#8be9b7', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyCopy: { color: '#475569', fontSize: 13 },
  list: { gap: 10, paddingBottom: 40 },
  card: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardPriority: { color: '#f6c85f', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardAge: { color: '#475569', fontSize: 10 },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  cardDesc: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveBtn: { backgroundColor: '#166534' },
  approveText: { color: '#8be9b7', fontSize: 12, fontWeight: '700' },
  rejectBtn: { backgroundColor: '#7f1d1d' },
  rejectText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
});
