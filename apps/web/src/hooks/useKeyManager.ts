import { useState, useCallback, useEffect } from 'react';

export interface ProviderKey {
  id: string;
  name: string;
  value: string;
  isConfigured: boolean;
  prefix: string;
}

export function useKeyManager() {
  const [keys, setKeys] = useState<Record<string, ProviderKey>>({
    openai: { id: 'openai', name: 'OpenAI API', value: '', isConfigured: false, prefix: 'sk-proj-' },
    anthropic: { id: 'anthropic', name: 'Anthropic API', value: '', isConfigured: false, prefix: 'sk-ant-' },
    gemini: { id: 'gemini', name: 'Google Gemini API', value: '', isConfigured: false, prefix: 'AIzaSy' },
    local: { id: 'local', name: 'Local OTel Node', value: '8000', isConfigured: true, prefix: 'PORT:' }
  });

  useEffect(() => {
    const openaiKey = sessionStorage.getItem('kudbee_openai_key') || '';
    const anthropicKey = sessionStorage.getItem('kudbee_anthropic_key') || '';
    const geminiKey = sessionStorage.getItem('kudbee_gemini_key') || '';
    const otelPort = sessionStorage.getItem('kudbee_otel_port') || '8000';

    setKeys(prev => ({
      ...prev,
      openai: { ...prev['openai']!, value: openaiKey, isConfigured: openaiKey.length > 10 },
      anthropic: { ...prev['anthropic']!, value: anthropicKey, isConfigured: anthropicKey.length > 10 },
      gemini: { ...prev['gemini']!, value: geminiKey, isConfigured: geminiKey.length > 10 },
      local: { ...prev['local']!, value: otelPort, isConfigured: !!otelPort }
    }));
  }, []);

  const updateKey = useCallback((id: string, newValue: string) => {
    setKeys(prev => ({
      ...prev,
      [id]: {
        ...prev[id]!,
        value: newValue,
        isConfigured: newValue.length > (id === 'local' ? 0 : 10)
      }
    }));
  }, []);

  const saveKeys = useCallback(() => {
    sessionStorage.setItem('kudbee_openai_key', keys['openai']!.value);
    sessionStorage.setItem('kudbee_anthropic_key', keys['anthropic']!.value);
    sessionStorage.setItem('kudbee_gemini_key', keys['gemini']!.value);
    sessionStorage.setItem('kudbee_otel_port', keys['local']!.value);
    return true;
  }, [keys]);

  return { keys, updateKey, saveKeys };
}
