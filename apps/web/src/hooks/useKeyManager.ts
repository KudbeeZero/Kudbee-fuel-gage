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
    const openaiKey = localStorage.getItem('kudbee_openai_key') || 'sk-proj-LN92fDka74jGks92019kLsakd92kasdQ23';
    const anthropicKey = localStorage.getItem('kudbee_anthropic_key') || 'sk-ant-sid01-Las9102Ksad92jKs8Aas0129kLasdK9';
    const geminiKey = localStorage.getItem('kudbee_gemini_key') || 'AIzaSyAs8192Ksadl29Kasd891Aksj182Ksdka9';
    const otelPort = localStorage.getItem('kudbee_otel_port') || '8000';

    setKeys(prev => ({
      ...prev,
      openai: { ...prev.openai, value: openaiKey, isConfigured: openaiKey.length > 10 },
      anthropic: { ...prev.anthropic, value: anthropicKey, isConfigured: anthropicKey.length > 10 },
      gemini: { ...prev.gemini, value: geminiKey, isConfigured: geminiKey.length > 10 },
      local: { ...prev.local, value: otelPort, isConfigured: !!otelPort }
    }));
  }, []);

  const updateKey = useCallback((id: string, newValue: string) => {
    setKeys(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        value: newValue,
        isConfigured: newValue.length > (id === 'local' ? 0 : 10)
      }
    }));
  }, []);

  const saveKeys = useCallback(() => {
    localStorage.setItem('kudbee_openai_key', keys.openai.value);
    localStorage.setItem('kudbee_anthropic_key', keys.anthropic.value);
    localStorage.setItem('kudbee_gemini_key', keys.gemini.value);
    localStorage.setItem('kudbee_otel_port', keys.local.value);
    return true; // indicates success
  }, [keys]);

  return { keys, updateKey, saveKeys };
}
