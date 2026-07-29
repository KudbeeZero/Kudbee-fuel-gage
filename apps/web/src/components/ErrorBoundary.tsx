import React from 'react';
import { AlertTriangle, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { reportError } from '../lib/errorTelemetry';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  stack: string;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  private errorReported = false;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', stack: '', copied: false };
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack || '' : '';
    return { hasError: true, message, stack };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Application crashed:', error, info.componentStack);
    this.reportError(error);
  }

  reportError(error: unknown) {
    if (this.errorReported) return;
    this.errorReported = true;
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, undefined);
  }

  copyError = () => {
    const text = `Error: ${this.state.message}\n${this.state.stack}\n\nURL: ${window.location.href}\nUA: ${navigator.userAgent}\nTime: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-rose-800/40 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
            <h1 className="text-center text-base font-bold text-rose-300">
              Control Tower Error
            </h1>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-400">
              An unexpected error occurred. Your data is safe — only the display crashed.
            </p>

            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <p className="font-mono text-[11px] font-semibold text-rose-400 break-words">
                {this.state.message}
              </p>
              {this.state.stack && (
                <p className="mt-1.5 font-mono text-[9px] text-slate-500 break-all leading-relaxed line-clamp-4">
                  {this.state.stack.split('\n').slice(1, 5).join(' → ')}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={this.copyError}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-300 active:scale-95 transition-transform"
              >
                {this.state.copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {this.state.copied ? 'Copied' : 'Copy Error'}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-300 active:scale-95 transition-transform"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Page
              </button>
            </div>

            <p className="mt-3 text-center font-mono text-[9px] text-slate-600">
              {new Date().toISOString().slice(0, 19).replace('T', ' ')} · {window.innerWidth}×{window.innerHeight}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
