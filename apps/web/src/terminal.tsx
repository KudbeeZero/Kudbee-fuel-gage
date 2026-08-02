import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { OllamaChat } from './pages/OllamaChat';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[Terminal] Root element not found');
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <OllamaChat />
      </ErrorBoundary>
    </StrictMode>,
  );
  // Notify the boot loader (terminal.html) that React has mounted. Without this,
  // the loader waits 12s then reports a mount-timeout even though the app is fine.
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('kudbee:terminal_mounted'));
  });
}
