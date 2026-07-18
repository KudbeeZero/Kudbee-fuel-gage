import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calculator,
  Activity,
  Zap,
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  Terminal,
  Cpu,
  ArrowRightLeft,
  DollarSign,
  Shield
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { getFormattedCost } from '../App';

// --- TYPES ---

export interface PlaygroundViewProps {
  currency: 'USD' | 'EUR' | 'GBP';
  onNewLogTriggered?: () => void;
}

interface ModelChip {
  id: string;
  label: string;
  provider: string;
  color: string;
  local?: boolean;
}

interface StreamChunk {
  id: string;
  timestamp: number;
  content: string;
  type: 'text' | 'system' | 'error';
}

// --- CONSTANTS ---

const MODEL_CHIPS: ModelChip[] = [
  { id: 'ternary-bonsai', label: 'Ternary Bonsai 27B', provider: 'Local', color: '#10b981', local: true },
  { id: 'claude-3-5', label: 'Claude 3.5', provider: 'Anthropic', color: '#f97316' },
  { id: 'gemini-1.5', label: 'Gemini 1.5 Pro', provider: 'Google', color: '#a855f7' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', color: '#ec4899' },
  { id: 'deepseek-r1', label: 'DeepSeek-R1', provider: 'DeepSeek', color: '#3b82f6' }
];

const RATES: Record<string, { in: number; out: number; name: string; platform: string }> = {
  'ternary-bonsai': { in: 0.00, out: 0.00, name: 'Ternary Bonsai 27B', platform: 'Local Inference' },
  'claude-3-5': { in: 3.00, out: 15.00, name: 'Claude 3.5 Sonnet', platform: 'Anthropic API' },
  'gemini-1.5': { in: 1.25, out: 5.00, name: 'Gemini 1.5 Pro', platform: 'Google AI Studio' },
  'gpt-4o': { in: 5.00, out: 15.00, name: 'GPT-4o', platform: 'OpenAI Developer Platform' },
  'deepseek-r1': { in: 0.55, out: 2.19, name: 'DeepSeek-R1', platform: 'DeepSeek Cloud' }
};

const MOCK_STREAM_RESPONSES: Record<string, string[]> = {
  'ternary-bonsai': [
    '[local] Loading ternary weights into VRAM...',
    '[local] Inference started on device: cpu (quantized 4-bit)',
    'The quantum-inspired attention mechanism demonstrates superior performance on low-resource devices, achieving 94% of the baseline accuracy while reducing memory footprint by 60%.',
    '[local] Tokens generated: 142 | Latency: 1.2s',
    '[local] Stream complete. Total cost: $0.000000'
  ],
  'claude-3-5': [
    'I\'ll help you implement a highly parallel telemetry parser. Here\'s a production-ready approach using Rust with Python bindings...',
    'The key architectural decision is to use a lock-free ring buffer for inter-thread communication, which minimizes contention under high load...',
    'For the parsing layer, I recommend a streaming JSON parser combined with a SIMD-accelerated tokenizer...'
  ],
  'gemini-1.5': [
    'Analyzing request for telemetry parser implementation...',
    'Here\'s a comprehensive solution using Go for high-throughput pipeline processing:',
    'The architecture leverages Go\'s goroutine model for concurrent parsing, with backpressure handled via context cancellation...'
  ],
  'gpt-4o': [
    'Implementing a parallel telemetry parser requires careful consideration of memory layout and cache locality...',
    'I suggest using a columnar in-memory format with vectorized processing for the aggregation layer...'
  ],
  'deepseek-r1': [
    'Thinking about the optimal approach for parallel telemetry parsing...',
    'The most efficient implementation uses a work-stealing scheduler with prefetch queues...'
  ]
};

// --- MEMOIZED SUB-COMPONENTS ---

const ModelChip = React.memo(({
  chip,
  isActive,
  onClick
}: {
  chip: ModelChip;
  isActive: boolean;
  onClick: (id: string) => void;
}) => {
  return (
    <button
      onClick={() => onClick(chip.id)}
      className={`active:scale-95 transition-transform duration-75 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-medium whitespace-nowrap transition-all cursor-pointer ${
        isActive
          ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.15)]'
          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
      }`}
    >
      {chip.local && <Cpu className="w-3 h-3" />}
      <span>{chip.label}</span>
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
      )}
    </button>
  );
});
ModelChip.displayName = 'ModelChip';

const TokenEstimator = React.memo(({
  charCount,
  tokenCount,
  estimatedCost,
  currency
}: {
  charCount: number;
  tokenCount: number;
  estimatedCost: number;
  currency: 'USD' | 'EUR' | 'GBP';
}) => {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
      <div className="flex items-center gap-1.5">
        <Terminal className="w-3 h-3" />
        <span>~{tokenCount.toLocaleString()} tokens</span>
      </div>
      <span className="text-slate-700">|</span>
      <div className="flex items-center gap-1.5">
        <DollarSign className="w-3 h-3" />
        <span className="text-emerald-400">Est: {getFormattedCost(estimatedCost, currency, 4)}</span>
      </div>
    </div>
  );
});
TokenEstimator.displayName = 'TokenEstimator';

const StreamOutput = React.memo(({
  chunks,
  isStreaming,
  onClear
}: {
  chunks: StreamChunk[];
  isStreaming: boolean;
  onClear: () => void;
}) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [chunks]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
      {/* Output Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-widest">
            Streamed Response
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              STREAMING
            </span>
          )}
        </div>
        <button
          onClick={onClear}
          className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          CLEAR
        </button>
      </div>

      {/* Output Body */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        {chunks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
              <Play className="w-4 h-4 text-slate-500 ml-0.5" />
            </div>
            <span className="text-[11px]">Response will stream here...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {chunks.map((chunk) => (
              <motion.div
                key={chunk.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`${
                  chunk.type === 'system'
                    ? 'text-slate-500 italic'
                    : chunk.type === 'error'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {chunk.content}
              </motion.div>
            ))}
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});
StreamOutput.displayName = 'StreamOutput';

// --- MAIN COMPONENT ---

export function PlaygroundView({ currency, onNewLogTriggered }: PlaygroundViewProps) {
  // --- STATE ---
  const [prompt, setPrompt] = useState(
    `// Sample prompt / code block pipeline telemetry simulation\nconst aiResponse = await anthropic.messages.create({\n  model: "claude-3-5-sonnet",\n  max_tokens: 1024,\n  messages: [{ role: "user", content: "Implement a highly parallel telemetry parser." }]\n});`
  );
  const [selectedModel, setSelectedModel] = useState('claude-3-5');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamChunks, setStreamChunks] = useState<StreamChunk[]>([]);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  // Calculator state (preserved from original)
  const [singleCap, setSingleCap] = useState(0.05);
  const [hourlyCapEnabled, setHourlyCapEnabled] = useState(true);

  // Load balancing gateway state
  const [weights, setWeights] = useState({
    Anthropic: 40,
    DeepSeek: 30,
    Google: 20,
    OpenAI: 10
  });

  const totalWeight = weights.Anthropic + weights.DeepSeek + weights.Google + weights.OpenAI;
  const relWeights = {
    Anthropic: totalWeight > 0 ? (weights.Anthropic / totalWeight) * 100 : 25,
    DeepSeek: totalWeight > 0 ? (weights.DeepSeek / totalWeight) * 100 : 25,
    Google: totalWeight > 0 ? (weights.Google / totalWeight) * 100 : 25,
    OpenAI: totalWeight > 0 ? (weights.OpenAI / totalWeight) * 100 : 25
  };

  const modelSpecs = {
    Anthropic: { costIn: 3.00, costOut: 15.00, speed: 75, quality: 9.8, color: '#f97316' },
    DeepSeek: { costIn: 0.55, costOut: 2.19, speed: 120, quality: 9.5, color: '#3b82f6' },
    Google: { costIn: 1.25, costOut: 5.00, speed: 100, quality: 8.8, color: '#a855f7' },
    OpenAI: { costIn: 5.00, costOut: 15.00, speed: 80, quality: 9.2, color: '#ec4899' }
  };

  const compositeCostIn = (
    (relWeights.Anthropic * modelSpecs.Anthropic.costIn) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.costIn) +
    (relWeights.Google * modelSpecs.Google.costIn) +
    (relWeights.OpenAI * modelSpecs.OpenAI.costIn)
  ) / 100;

  const compositeCostOut = (
    (relWeights.Anthropic * modelSpecs.Anthropic.costOut) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.costOut) +
    (relWeights.Google * modelSpecs.Google.costOut) +
    (relWeights.OpenAI * modelSpecs.OpenAI.costOut)
  ) / 100;

  const compositeSpeed = (
    (relWeights.Anthropic * modelSpecs.Anthropic.speed) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.speed) +
    (relWeights.Google * modelSpecs.Google.speed) +
    (relWeights.OpenAI * modelSpecs.OpenAI.speed)
  ) / 100;

  const compositeQuality = (
    (relWeights.Anthropic * modelSpecs.Anthropic.quality) +
    (relWeights.DeepSeek * modelSpecs.DeepSeek.quality) +
    (relWeights.Google * modelSpecs.Google.quality) +
    (relWeights.OpenAI * modelSpecs.OpenAI.quality)
  ) / 100;

  const pieData = [
    { name: 'Claude 3.5 Sonnet', value: Math.round(relWeights.Anthropic), color: '#f97316' },
    { name: 'DeepSeek-R1', value: Math.round(relWeights.DeepSeek), color: '#3b82f6' },
    { name: 'Gemini 1.5 Pro', value: Math.round(relWeights.Google), color: '#a855f7' },
    { name: 'GPT-4o', value: Math.round(relWeights.OpenAI), color: '#ec4899' }
  ].filter(d => d.value > 0);

  const applyPreset = (preset: 'cost' | 'reasoning' | 'balanced') => {
    if (preset === 'cost') {
      setWeights({ Anthropic: 10, DeepSeek: 80, Google: 10, OpenAI: 0 });
    } else if (preset === 'reasoning') {
      setWeights({ Anthropic: 60, DeepSeek: 5, Google: 10, OpenAI: 25 });
    } else {
      setWeights({ Anthropic: 30, DeepSeek: 40, Google: 20, OpenAI: 10 });
    }
  };

  // Token arithmetic
  const charCount = prompt.length;
  const tokenCount = Math.ceil(charCount / 4);
  const predictedOutputTokens = Math.ceil(tokenCount * 0.35);

  const selectedRate = RATES[selectedModel] || RATES['claude-3-5'];
  const selectedCost = ((tokenCount / 1000000) * selectedRate.in) + ((predictedOutputTokens / 1000000) * selectedRate.out);

  // --- HANDLERS ---

  const handleStream = useCallback(async () => {
    if (isStreaming) {
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);
    setStreamChunks([]);

    const responses = MOCK_STREAM_RESPONSES[selectedModel] || MOCK_STREAM_RESPONSES['claude-3-5'];
    let chunkIndex = 0;

    const interval = setInterval(() => {
      if (chunkIndex >= responses.length) {
        clearInterval(interval);
        setIsStreaming(false);
        return;
      }

      const content = responses[chunkIndex];
      setStreamChunks(prev => [...prev, {
        id: `chunk-${Date.now()}-${chunkIndex}`,
        timestamp: Date.now(),
        content,
        type: content.startsWith('[') ? 'system' : 'text'
      }]);
      chunkIndex++;
    }, 600 + Math.random() * 800);

    return () => clearInterval(interval);
  }, [isStreaming, selectedModel]);

  const handleInjectTrace = async () => {
    setIsLogging(true);
    const modelMap: Record<string, { provider: string; model_name: string }> = {
      'ternary-bonsai': { provider: 'Local', model_name: 'ternary-bonsai-27b' },
      'claude-3-5': { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' },
      'gemini-1.5': { provider: 'Google', model_name: 'gemini-1.5-pro' },
      'gpt-4o': { provider: 'OpenAI', model_name: 'gpt-4o' },
      'deepseek-r1': { provider: 'DeepSeek', model_name: 'deepseek-r1' }
    };
    const mapped = modelMap[selectedModel] || { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' };

    try {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          provider: mapped.provider,
          model_name: mapped.model_name,
          input_tokens: tokenCount,
          output_tokens: predictedOutputTokens,
          project_name: "kilo-fuel-gauge"
        })
      });
      if (res.ok) {
        setIsLogged(true);
        setTimeout(() => setIsLogged(false), 2000);
        if (onNewLogTriggered) onNewLogTriggered();
      }
    } catch (e) {
      console.error("Failed to inject playground trace to SQLite:", e);
    } finally {
      setIsLogging(false);
    }
  };

  const handleCopyOutput = () => {
    const fullText = streamChunks.map(c => c.content).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4" id="playground-view-container">
      
      {/* 1. SPLIT-PANE IDE CONTAINER */}
      <div className="flex-1 flex flex-col min-h-0 gap-4">
        
        {/* TOP HALF: INPUT PANE */}
        <div className="flex flex-col gap-3 shrink-0">
          
          {/* Multi-Model Quick Selectors */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest shrink-0 mr-1">
              Route Target:
            </span>
            {MODEL_CHIPS.map((chip) => (
              <ModelChip
                key={chip.id}
                chip={chip}
                isActive={selectedModel === chip.id}
                onClick={setSelectedModel}
              />
            ))}
          </div>

          {/* Prompt Input Area */}
          <div className="relative flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 resize-none transition-colors animate-none leading-relaxed"
              placeholder="Enter prompt or paste code context..."
              style={{ minHeight: '120px' }}
            />
            
            {/* Pre-Flight Token & Cost Estimator */}
            <div className="flex items-center justify-between">
              <TokenEstimator
                charCount={charCount}
                tokenCount={tokenCount}
                estimatedCost={selectedCost}
                currency={currency}
              />
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="active:scale-95 transition-transform duration-75 flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                >
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAdvanced ? 'HIDE ADVANCED' : 'ADVANCED'}
                </button>
                
                <button
                  onClick={handleStream}
                  className={`active:scale-95 transition-transform duration-75 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer ${
                    isStreaming
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_8px_rgba(52,211,153,0.15)]'
                  }`}
                >
                  {isStreaming ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Cancel Stream
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                      Route Prompt
                    </>
                  )}
                </button>

                <button
                  onClick={handleInjectTrace}
                  disabled={isLogging}
                  className={`active:scale-95 transition-transform duration-75 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold tracking-widest uppercase transition-all cursor-pointer ${
                    isLogged
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <Zap className={`w-3.5 h-3.5 ${isLogging ? 'animate-bounce' : ''}`} />
                  {isLogging ? 'LOGGING...' : isLogged ? 'LOGGED' : 'INJECT'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM HALF: OUTPUT PANE */}
        <StreamOutput
          chunks={streamChunks}
          isStreaming={isStreaming}
          onClear={() => setStreamChunks([])}
        />
      </div>

      {/* 2. ADVANCED PANEL (Collapsible) */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
              
              {/* Cross-Provider Analysis */}
              <div className="mb-6">
                <h3 className="font-display font-semibold text-slate-200 text-sm tracking-wide uppercase mb-4">Cross-Provider Analysis</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {Object.keys(RATES).filter(k => k !== 'ternary-bonsai').map((k) => {
                      const rate = RATES[k as keyof typeof RATES];
                      const cost = ((tokenCount / 1000000) * rate.in) + ((predictedOutputTokens / 1000000) * rate.out);
                      const isOptimal = cost === Math.min(...Object.values(RATES).filter(r => r.in > 0).map(r => ((tokenCount / 1000000) * r.in) + ((predictedOutputTokens / 1000000) * r.out)));
                      return (
                        <div key={k} className={`p-3 rounded-lg border transition-all ${
                          isOptimal
                            ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_8px_rgba(52,211,153,0.05)]'
                            : 'bg-slate-950/80 border-slate-800/60'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-200">{rate.platform}</span>
                            {isOptimal && (
                              <span className="text-[8px] font-mono font-bold uppercase tracking-wider bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded shadow-[0_0_6px_rgba(52,211,153,0.4)]">OPTIMAL VALUE</span>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] font-mono text-slate-500">{rate.name}</span>
                            <span className="font-mono text-sm text-slate-100 font-bold">{getFormattedCost(cost, currency, 6)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pie Chart */}
                  <div className="h-40 flex justify-center items-center relative bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#020617',
                            borderColor: '#1e293b',
                            borderRadius: '8px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '11px'
                          }}
                          itemStyle={{ color: '#e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">ROUTING</span>
                      <span className="font-mono text-xs text-slate-300 font-semibold">HYBRID</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Threshold Alerts */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-display font-semibold text-slate-200 text-sm">Telemetry Threshold Rules</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                      <span className="uppercase tracking-wider">Single Request Hard-Cap</span>
                      <span className="text-emerald-400 font-bold">{getFormattedCost(singleCap, currency, 2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="2.00"
                      step="0.01"
                      value={singleCap}
                      onChange={(e) => setSingleCap(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-600">
                      <span>{getFormattedCost(0.01, currency, 2)}</span>
                      <span>{getFormattedCost(1.00, currency, 2)}</span>
                      <span>{getFormattedCost(2.00, currency, 2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800/60">
                    <div>
                      <span className="block text-xs font-semibold text-slate-200">Hourly Run-Rate Warning</span>
                      <span className="block text-[10px] text-slate-500 mt-1">Warn if projected run-rate exceeds quota bounds.</span>
                    </div>
                    <button
                      onClick={() => setHourlyCapEnabled(!hourlyCapEnabled)}
                      className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative focus:outline-none cursor-pointer ${
                        hourlyCapEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-slate-950 rounded-full shadow transition-all duration-300 ${
                        hourlyCapEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Gateway Load Balancing Simulator */}
              <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <div>
                      <h3 className="font-display font-semibold text-slate-200 text-sm">AI Gateway Multi-Model Router</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Configure weights to dynamically proxy requests between active providers.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => applyPreset('cost')} className="px-2.5 py-1 rounded text-[10px] font-mono border border-emerald-900/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/30 transition-all cursor-pointer">PRESET: COST OPTIMAL</button>
                    <button onClick={() => applyPreset('reasoning')} className="px-2.5 py-1 rounded text-[10px] font-mono border border-purple-900/40 bg-purple-950/20 text-purple-400 hover:bg-purple-900/30 transition-all cursor-pointer">PRESET: MAX INTELLIGENCE</button>
                    <button onClick={() => applyPreset('balanced')} className="px-2.5 py-1 rounded text-[10px] font-mono border border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 transition-all cursor-pointer">PRESET: BALANCED</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 space-y-3">
                    {Object.entries(weights).map(([provider, weight]) => {
                      const colorClass = provider === 'Anthropic' ? 'text-orange-400 accent-orange-500' : provider === 'DeepSeek' ? 'text-blue-400 accent-blue-500' : provider === 'Google' ? 'text-purple-400 accent-purple-500' : 'text-pink-400 accent-pink-500';
                      return (
                        <div key={provider} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className={`font-semibold ${colorClass.split(' ')[0]}`}>{provider === 'Anthropic' ? 'Claude 3.5 Sonnet' : provider === 'DeepSeek' ? 'DeepSeek-R1' : provider === 'Google' ? 'Gemini 1.5 Pro' : 'GPT-4o'} ({provider})</span>
                            <span className="text-slate-300">{Math.round((weight / totalWeight) * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="100" value={weight} onChange={(e) => setWeights(w => ({ ...w, [provider]: parseInt(e.target.value) || 0 }))} className={`w-full ${colorClass.split(' ')[1]} cursor-pointer h-1 bg-slate-950 rounded-lg appearance-none`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                    <div className="h-32 flex justify-center items-center relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={4} dataKey="value">
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">ROUTING</span>
                        <span className="font-mono text-[11px] text-slate-300 font-semibold">HYBRID</span>
                      </div>
                    </div>
                    <div className="space-y-2 font-mono">
                      <div>
                        <span className="block text-[9px] text-slate-500 uppercase">Weighted Cost / 1M</span>
                        <span className="text-xs text-emerald-400 font-semibold">{getFormattedCost(compositeCostIn, currency, 2)} | {getFormattedCost(compositeCostOut, currency, 2)}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-500 uppercase">Composite Velocity</span>
                        <span className="text-xs text-slate-300 font-semibold">{Math.round(compositeSpeed)} t/s</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-500 uppercase">Composite Accuracy</span>
                        <span className="text-xs text-purple-400 font-semibold">{compositeQuality.toFixed(2)}/10.0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
