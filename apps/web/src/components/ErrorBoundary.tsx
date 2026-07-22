import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Application crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
          <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center shadow-2xl">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
            <h1 className="font-display text-lg font-semibold text-slate-200">
              Control Tower Unavailable
            </h1>
            <p className="mt-3 font-mono text-xs leading-relaxed text-slate-400">
              An unhandled error caused the interface to crash. Your data and backend
              services are unaffected.
            </p>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer font-mono text-[10px] text-slate-500 hover:text-slate-300">
                View error details
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] text-rose-400">
                {this.state.message}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 font-mono text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
