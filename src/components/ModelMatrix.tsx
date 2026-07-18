import { Zap, Brain, Coins } from 'lucide-react';

const models = [
  {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    inputCost: '$3.00',
    outputCost: '$15.00',
    speed: '~75 t/s',
    tag: 'Best for logic reasoning',
    icon: Brain,
    color: 'text-orange-400'
  },
  {
    name: 'DeepSeek-R1',
    provider: 'DeepSeek',
    inputCost: '$0.55',
    outputCost: '$2.19',
    speed: '~120 t/s',
    tag: 'Best for cheap execution',
    icon: Coins,
    color: 'text-blue-400'
  },
  {
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    inputCost: '$1.25',
    outputCost: '$5.00',
    speed: '~100 t/s',
    tag: 'Best for large context',
    icon: Zap,
    color: 'text-purple-400'
  }
];

export function ModelMatrix() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold text-slate-200 mb-6">Multi-Model Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[500px]">
          <thead>
            <tr className="border-b border-slate-800 text-sm text-slate-400">
              <th className="pb-4 font-medium pl-2">Model</th>
              <th className="pb-4 font-medium">Cost / 1M (In/Out)</th>
              <th className="pb-4 font-medium">Speed</th>
              <th className="pb-4 font-medium">Optimization</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {models.map((model, idx) => (
              <tr key={idx} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                <td className="py-4 pl-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                      <model.icon className={`w-4 h-4 ${model.color}`} />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">{model.name}</div>
                      <div className="text-xs text-slate-500">{model.provider}</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 font-mono text-slate-300 tracking-wide">
                  {model.inputCost} / {model.outputCost}
                </td>
                <td className="py-4 font-mono text-slate-300 tracking-wider">
                  {model.speed}
                </td>
                <td className="py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    {model.tag}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
