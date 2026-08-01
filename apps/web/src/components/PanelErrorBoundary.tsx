import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError, type ErrorDiagnosticReceipt } from '../lib/errorTelemetry';

interface Props { children: ReactNode; panel?: string; }
interface State {
  hasError: boolean;
  message: string;
  receipt: ErrorDiagnosticReceipt | null;
  copyStatus: 'idle' | 'copied' | 'failed';
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '', receipt: null, copyStatus: 'idle' };
  }

  static getDerivedStateFromError(e: unknown): Partial<State> {
    return { hasError: true, message: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown, info: ErrorInfo) {
    const error = e instanceof Error ? e : new Error(String(e));
    const receipt = reportError(error, info.componentStack, { panel: this.props.panel });
    this.setState({ receipt });
    console.error(`[PanelErrorBoundary] ${receipt.panel} crashed [${receipt.traceId}]:`, error);
  }

  copyDiagnostics = async () => {
    const diagnostics = JSON.stringify({
      panel: this.props.panel || 'unknown',
      message: this.state.message,
      ...this.state.receipt,
    }, null, 2);

    try {
      await navigator.clipboard.writeText(diagnostics);
      this.setState({ copyStatus: 'copied' });
    } catch {
      this.setState({ copyStatus: 'failed' });
    }
  };

  retry = () => {
    this.setState({ hasError: false, message: '', receipt: null, copyStatus: 'idle' });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-center">
          <span className="font-mono text-[10px] text-rose-400">Panel Fault — {this.props.panel || 'unknown'}</span>
          <p className="mt-2 break-words font-mono text-[10px] text-rose-200/80">{this.state.message}</p>
          {this.state.receipt && (
            <p className="mt-2 font-mono text-[9px] text-slate-400">
              trace {this.state.receipt.traceId} · release {this.state.receipt.release}
            </p>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <button type="button" onClick={this.retry}
              className="rounded border border-rose-500/20 px-2 py-1 font-mono text-[9px] text-rose-300 hover:bg-rose-500/10">
              Retry
            </button>
            <button type="button" onClick={this.copyDiagnostics}
              className="rounded border border-slate-500/30 px-2 py-1 font-mono text-[9px] text-slate-300 hover:bg-slate-500/10">
              {this.state.copyStatus === 'copied' ? 'Copied' : this.state.copyStatus === 'failed' ? 'Copy failed' : 'Copy diagnostics'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
export default PanelErrorBoundary;
