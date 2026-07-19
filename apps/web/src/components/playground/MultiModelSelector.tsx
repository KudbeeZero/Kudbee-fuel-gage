import React from 'react';

interface MultiModelSelectorProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

export function MultiModelSelector({ selectedModel, setSelectedModel }: MultiModelSelectorProps) {
  const models = [
    'Claude 3.5 Sonnet',
    'DeepSeek-R1',
    'GPT-4o',
    'Gemini 1.5 Pro',
    'Ternary Bonsai 27B'
  ];

  return (
    <div className="pt-2">
      <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Simulated Active Route</label>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {models.map(model => (
          <button
            key={model}
            onClick={() => setSelectedModel(model)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              selectedModel === model
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(52,211,153,0.1)]'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {model}
          </button>
        ))}
      </div>
    </div>
  );
}
