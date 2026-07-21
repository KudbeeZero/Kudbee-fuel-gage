import { useState, useCallback } from 'react';
import { apiPost } from '../lib/apiClient';

export function useTelemetryLogger(onNewLogTriggered?: () => void) {
  const [isLogged, setIsLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const handleInjectTrace = useCallback(async (selectedModel: string, tokenCount: number, predictedOutputTokens: number) => {
    setIsLogging(true);
    const modelMap: Record<string, { provider: string; model_name: string }> = {
      'Claude 3.5 Sonnet': { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' },
      'DeepSeek-R1': { provider: 'DeepSeek', model_name: 'deepseek-r1' },
      'GPT-4o': { provider: 'Cursor', model_name: 'gpt-4o' },
      'Gemini 1.5 Pro': { provider: 'Google', model_name: 'gemini-1.5-pro' },
      'Ternary Bonsai 27B': { provider: 'Ternary', model_name: 'ternary-bonsai-27b' }
    };
    const mapped = modelMap[selectedModel] || { provider: 'Anthropic', model_name: selectedModel.toLowerCase().replace(/\s+/g, '-') };

    try {
      await apiPost('/api/telemetry/ingest', {
        trace_id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        model: mapped.model_name,
        tokens_in: tokenCount,
        tokens_out: predictedOutputTokens,
        cost: 0,
        status: 'OK',
        provider: mapped.provider,
        project_name: 'kilo-fuel-gauge'
      });
      setIsLogged(true);
      setTimeout(() => setIsLogged(false), 2000);
      if (onNewLogTriggered) onNewLogTriggered();
    } catch (e) {
      console.error('Failed to inject playground trace:', e);
    } finally {
      setIsLogging(false);
    }
  }, [onNewLogTriggered]);

  return { isLogged, isLogging, handleInjectTrace };
}
