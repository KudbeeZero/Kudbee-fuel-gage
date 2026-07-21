import { useState, useCallback } from 'react';

export interface GatewayLog {
  id: string;
  timestamp: Date;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export function useRoutingRules() {
  const [gatewayLogs, setGatewayLogs] = useState<GatewayLog[]>([]);
  const [activeRoute, setActiveRoute] = useState<'IDLE' | 'PRIMARY' | 'FAILOVER'>('IDLE');
  
  const addLog = useCallback((level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => {
    setGatewayLogs(prev => [{ id: Math.random().toString(), timestamp: new Date(), level, message }, ...prev].slice(0, 50));
  }, []);

  const executeGatewayRequest = useCallback(async (payload: any) => {
    setActiveRoute('PRIMARY');
    addLog('INFO', `Routing request to Primary Region (us-east-1) for model: ${payload.model || 'unknown'}`);
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const isRateLimited = Math.random() < 0.3;
        
        if (isRateLimited) {
          addLog('WARN', `Rate limit 429 hit on Primary Region (us-east-1).`);
          addLog('INFO', `CRIS router engaging Circuit Breaker. Rewriting payload for failover...`);
          
          setTimeout(() => {
            setActiveRoute('FAILOVER');
            const fallbackModel = payload.model || 'unknown';
            addLog('INFO', `Rerouting request to Failover Region (eu-central-1) for fallback model (${fallbackModel})...`);
            
            setTimeout(() => {
              addLog('SUCCESS', `Failover request completed successfully via eu-central-1.`);
              setTimeout(() => setActiveRoute('IDLE'), 2000);
              resolve({ success: true, region: 'eu-central-1', model: fallbackModel });
            }, 1000);
            
          }, 500);
          
        } else {
          addLog('SUCCESS', `Request completed successfully via Primary Region (us-east-1).`);
          setTimeout(() => setActiveRoute('IDLE'), 2000);
          resolve({ success: true, region: 'us-east-1', model: payload.model || 'unknown' });
        }
      }, 1000);
    });
  }, [addLog]);

  return { gatewayLogs, activeRoute, executeGatewayRequest, addLog };
}
