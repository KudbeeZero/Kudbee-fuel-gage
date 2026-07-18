import { useState, useCallback, useRef } from 'react';

export function useStreamEngine() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamOutput, setStreamOutput] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startStream = useCallback((prompt: string, model: string, onComplete?: () => void) => {
    setIsStreaming(true);
    setStreamOutput('');
    
    // Fake chunked response
    const words = `[System response from ${model}]: Acknowledged. Processing trace payload... Streaming chunked output blocks for telemetry analysis. Execution proceeding nominally.`.split(' ');
    
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
