import { useState, useCallback, useRef, useEffect } from 'react';

export function useStreamEngine() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamOutput, setStreamOutput] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const startStream = useCallback((prompt: string, model: string, onComplete?: () => void) => {
    setIsStreaming(true);
    setStreamOutput('');

    // Real-data echo: replay the operator's actual trace/prompt token-by-token
    // (no fabricated LLM response). The playground has no live model backend,
    // so we surface the submitted payload verbatim as a streamed transcript.
    const words = prompt.trim().length > 0
      ? prompt.split(/\s+/)
      : [`[no payload submitted for ${model}]`];

    let currentIndex = 0;

    const streamNextChunk = () => {
      if (currentIndex < words.length) {
        setStreamOutput(prev => prev + (prev ? ' ' : '') + words[currentIndex]);
        currentIndex++;
        timeoutRef.current = setTimeout(streamNextChunk, 50 + Math.random() * 50);
      } else {
        setIsStreaming(false);
        if (onComplete) onComplete();
      }
    };

    timeoutRef.current = setTimeout(streamNextChunk, 200);
  }, []);

  const cancelStream = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsStreaming(false);
  }, []);

  return { isStreaming, streamOutput, startStream, cancelStream };
}
