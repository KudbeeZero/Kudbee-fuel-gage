export function ModelMatrix() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold text-slate-200 mb-6">Multi-Model Comparison</h2>
      <div className="flex flex-col items-center justify-center text-center py-12 border border-dashed border-slate-800 rounded-xl">
        <p className="text-sm text-slate-400 font-medium">Awaiting Agent Data</p>
        <p className="text-xs text-slate-600 mt-1 font-mono">No active model telemetry captured</p>
      </div>
    </div>
  );
}
