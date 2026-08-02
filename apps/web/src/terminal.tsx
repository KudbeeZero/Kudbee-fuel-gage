import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('kudbee:terminal_mounted'));
  });
}
