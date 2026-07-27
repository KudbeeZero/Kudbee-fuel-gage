import { useState, useEffect, useCallback } from 'react';
import {
  Swords,
  Trophy,
  Shield,
  Target,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';

interface RankInfo {
  name: string;
  min: number;
  badge: string;
}

interface SeniorityEntry {
  tokenId: string;
  score: number;
  challenges: number;
  wins: number;
  losses: number;
  rank: string;
  badge: string;
  lastChallenge?: string;
}

interface ChallengeResult {
  tokenId: string;
  verdict: 'PASS' | 'PARTIAL' | 'FAIL';
  score: number;
  rank: string;
  badge: string;
  challenges: number;
  wins: number;
  losses: number;
  matchedKeywords: string[];
  tokenSnippet: string;
  leaderboard?: SeniorityEntry[];
}

interface LeaderboardResponse {
  leaderboard: SeniorityEntry[];
  total: number;
}

const RANK_COLORS: Record<string, string> = {
  ROOKIE: '#94a3b8',
  TRIED: '#22c55e',
  PROVEN: '#3b82f6',
  VETERAN: '#a855f7',
  ELDER: '#f59e0b',
  SAGE: '#ef4444',
};

export default function ChallengePanel() {
  const [leaderboard, setLeaderboard] = useState<SeniorityEntry[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [tokenId, setTokenId] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ranks, setRanks] = useState<RankInfo[]>([]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await apiGet('/api/think/leaderboard?limit=10');
      const lb = data as LeaderboardResponse;
      setLeaderboard(lb.leaderboard);
      setTotalTokens(lb.total);
    } catch {
    }
  }, []);

  const fetchRanks = useCallback(async () => {
    try {
      const data = await apiGet('/api/think/ranks');
      const r = data as { ranks: RankInfo[] };
      if (Array.isArray(r.ranks)) setRanks(r.ranks);
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    fetchRanks();
    const interval = setInterval(fetchLeaderboard, 15000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard, fetchRanks]);

  const handleChallenge = async () => {
    if (!tokenId.trim() || !query.trim()) {
      setError('Both token ID and challenge query are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await apiPost('/api/think/challenge', {
        tokenId: tokenId.trim(),
        query: query.trim(),
      });
      const cr = data as ChallengeResult;
      setResult(cr);
      fetchLeaderboard();
    } catch (e: any) {
      setError(e?.message || 'Challenge failed');
    } finally {
      setLoading(false);
    }
  };

  const verdictIcon = (v: string) => {
    switch (v) {
      case 'PASS':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'PARTIAL':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'FAIL':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-4 text-sm font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-semibold text-zinc-100">Challenge Arena</h2>
        </div>
        <button
          onClick={fetchLeaderboard}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Challenge Form */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-zinc-400">
          <Target className="w-4 h-4" />
          <span className="text-xs">Challenge a think token to test its reasoning</span>
        </div>
        <input
          type="text"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="Token ID (e.g. tr-compact-12345)"
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-zinc-100 text-xs placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
        />
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Adversarial query to challenge the token..."
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-zinc-100 text-xs placeholder-zinc-500 focus:border-purple-500 focus:outline-none resize-none"
        />
        {error && <div className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</div>}
        <button
          onClick={handleChallenge}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          {loading ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Evaluating...</>
          ) : (
            <><Swords className="w-4 h-4" /> Challenge Token</>
          )}
        </button>
      </div>

      {/* Challenge Result */}
      {result && (
        <div className={`bg-zinc-900 border rounded-lg p-4 space-y-2 ${
          result.verdict === 'PASS' ? 'border-green-700' :
          result.verdict === 'PARTIAL' ? 'border-yellow-700' :
          'border-red-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {verdictIcon(result.verdict)}
              <span className={`text-sm font-bold ${
                result.verdict === 'PASS' ? 'text-green-400' :
                result.verdict === 'PARTIAL' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {result.verdict} — {result.score}%
              </span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400">
              <Trophy className="w-4 h-4" />
              <span className="text-xs">{result.badge} {result.rank}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
            <div>Challenges: <span className="text-zinc-200">{result.challenges}</span></div>
            <div>Wins: <span className="text-green-400">{result.wins}</span></div>
            <div>Losses: <span className="text-red-400">{result.losses}</span></div>
          </div>
          {result.matchedKeywords.length > 0 && (
            <div className="text-xs text-zinc-500">
              Matched: {result.matchedKeywords.join(', ')}
            </div>
          )}
          {result.tokenSnippet && (
            <div className="text-xs text-zinc-500 bg-zinc-950 rounded p-2 max-h-16 overflow-y-auto">
              {result.tokenSnippet}
            </div>
          )}
        </div>
      )}

      {/* Rank Tiers */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3 text-zinc-400">
          <Shield className="w-4 h-4" />
          <span className="text-xs">Seniority Protocol</span>
        </div>
        <div className="space-y-1">
          {ranks.map((r) => (
            <div key={r.name} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                <span className="text-base">{r.badge}</span>
                <span style={{ color: RANK_COLORS[r.name] || '#94a3b8' }}>{r.name}</span>
              </span>
              <span className="text-zinc-500">≥ {r.min} pts</span>
            </div>
          ))}
          {ranks.length === 0 && (
            <div className="text-xs text-zinc-600">ROOKIE → TRIED → PROVEN → VETERAN → ELDER → SAGE</div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Trophy className="w-4 h-4" />
            <span className="text-xs">Leaderboard ({totalTokens} tokens)</span>
          </div>
        </div>
        {leaderboard.length === 0 ? (
          <div className="text-xs text-zinc-600 py-4 text-center">
            No tokens challenged yet. Challenge one above to start the rankings.
          </div>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-5 text-[10px] text-zinc-600 pb-1 border-b border-zinc-800">
              <span>#</span>
              <span>Rank</span>
              <span>Token</span>
              <span className="text-right">Score</span>
              <span className="text-right">W/L</span>
            </div>
            {leaderboard.map((entry, i) => (
              <div
                key={entry.tokenId}
                className={`grid grid-cols-5 text-xs py-1 rounded px-1 ${
                  i === 0 ? 'bg-yellow-900/20' : 'hover:bg-zinc-800/50'
                }`}
              >
                <span className="text-zinc-500">#{i + 1}</span>
                <span style={{ color: RANK_COLORS[entry.rank] || '#94a3b8' }}>
                  {entry.badge} {entry.rank}
                </span>
                <span className="text-zinc-300 truncate" title={entry.tokenId}>
                  {entry.tokenId.slice(0, 20)}
                </span>
                <span className="text-right text-zinc-200">{entry.score}</span>
                <span className="text-right text-zinc-500">
                  {entry.wins}/{entry.losses}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
