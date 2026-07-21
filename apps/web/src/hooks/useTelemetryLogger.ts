import { useState, useCallback } from 'react';

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
    const mapped = modelMap[selectedModel] || { provider: 'unknown', model_name: selectedModel.toLowerCase().replace(/\s+/g, '-') };

    try {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          provider: mapped.provider,
          model_name: mapped.model_name,
          input_tokens: tokenCount,
          output_tokens: predictedOutputTokens,
          project_name: "kilo-fuel-gauge"
        })
      });
      if (res.ok) {
        setIsLogged(true);
        setTimeout(() => setIsLogged(false), 2000);
        if (onNewLogTriggered) onNewLogTriggered();
      }
    } catch (e) {
      console.error("Failed to inject playground trace to SQLite:", e);
    } finally {
      setIsLogging(false);
    }
  }, [onNewLogTriggered]);

  return { isLogged, isLogging, handleInjectTrace };
}
