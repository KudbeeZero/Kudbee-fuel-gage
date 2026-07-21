import { useState, useCallback } from 'react';

export function useTelemetryLogger(onNewLogTriggered?: () => void) {
  const [isLogged, setIsLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const handleInjectTrace = useCallback(async (selectedModel: string, tokenCount: number, predictedOutputTokens: number) => {
    setIsLogging(true);
    const provider = selectedModel.toLowerCase().includes('claude') || selectedModel.toLowerCase().includes('anthropic')
      ? 'Anthropic'
      : selectedModel.toLowerCase().includes('gpt') || selectedModel.toLowerCase().includes('openai')
        ? 'OpenAI'
        : selectedModel.toLowerCase().includes('gemini') || selectedModel.toLowerCase().includes('google')
          ? 'Google'
          : selectedModel.toLowerCase().includes('deepseek')
            ? 'DeepSeek'
            : 'unknown';
    const model_name = selectedModel.toLowerCase().replace(/\s+/g, '-');

    try {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          provider,
          model_name,
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
