import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { OllamaChat } from './pages/OllamaChat';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OllamaChat />
  </StrictMode>,
);
