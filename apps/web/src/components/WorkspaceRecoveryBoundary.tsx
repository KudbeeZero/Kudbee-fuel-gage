import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  panel?: string;
}

interface State {
  hasError: boolean;
  message: string;
  errorStack?: string;
}

export class WorkspaceRecoveryBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(e: unknown): State {
    return {
      hasError: true,
      message: e instanceof Error ? e.message : String(e),
      errorStack: e instanceof Error ? e.stack : undefined
    };
  }

  componentDidCatch(e: unknown) {
    console.error(`[WorkspaceRecovery] ${this.props.panel || 'layout'} fatal error:`, e);
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: '', errorStack: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-dvh items-center justify-center bg-slate-950 p-8">
          <div className="max-w-lg w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-[0_16px_64px_rgba(0,0,0,0.5)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <AlertTriangle className="h-7 w-7 text-rose-400" />
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-200">
              Workspace Recovery
            </h2>
            <p className="mt-2 font-mono text-xs text-slate-400">
              {this.props.panel || 'The studio layout'} encountered a fatal render error. The workspace has been halted to prevent cascading failures.
            </p>
            {this.state.message && (
              <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-left">
                <div className="font-mono text-[10px] uppercase tracking-widest text-rose-400 mb-1">Error Detail</div>
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-rose-300 break-all">
                  {this.state.message}
                </pre>
              </div>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRecover}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Workspace
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-slate-300 transition-all hover:bg-slate-700"
              >
                Hard Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default WorkspaceRecoveryBoundary;
