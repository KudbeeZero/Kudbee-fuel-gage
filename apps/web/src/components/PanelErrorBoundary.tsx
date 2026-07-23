import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; panel?: string; }
interface State { hasError: boolean; message: string; }

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, message: '' }; }
  static getDerivedStateFromError(e: unknown): State {
    return { hasError: true, message: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    console.error(`[PanelErrorBoundary] ${this.props.panel || 'unknown'} crashed:`, e);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-center">
          <span className="font-mono text-[10px] text-rose-400">Panel Fault — {this.props.panel || 'unknown'}</span>
          <button type="button" onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-2 rounded border border-rose-500/20 px-2 py-1 font-mono text-[9px] text-rose-300 hover:bg-rose-500/10">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
export default PanelErrorBoundary;
