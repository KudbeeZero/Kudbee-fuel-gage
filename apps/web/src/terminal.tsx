import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OsStreamProvider } from './components/OsStreamProvider';
import { LiveTerminal } from './components/thinkbox/LiveTerminal';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[Terminal] Root element not found');
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <OsStreamProvider>
          <LiveTerminal
            missionId="KUDBEE-TERMINAL"
            branch="main"
            simulation={false}
            workspaceId="terminal-standalone"
          />
        </OsStreamProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('kudbee:terminal_mounted'));
  });
}
