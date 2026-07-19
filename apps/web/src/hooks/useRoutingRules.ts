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
    addLog('INFO', `Routing request to Primary Region (us-east-1) for model: ${payload.model || 'claude-3-5-sonnet'}`);
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // 30% chance to fail
        const isRateLimited = Math.random() < 0.3;
        
        if (isRateLimited) {
          addLog('WARN', `Rate limit 429 hit on Primary Region (us-east-1).`);
          addLog('INFO', `CRIS router engaging Circuit Breaker. Rewriting payload for failover...`);
          
          setTimeout(() => {
            setActiveRoute('FAILOVER');
            addLog('INFO', `Rerouting request to Failover Region (eu-central-1) for fallback model (deepseek-r1)...`);
            
            setTimeout(() => {
              addLog('SUCCESS', `Failover request completed successfully via eu-central-1.`);
              setTimeout(() => setActiveRoute('IDLE'), 2000);
              resolve({ success: true, region: 'eu-central-1', model: 'deepseek-r1' });
            }, 1000);
            
          }, 500);
          
        } else {
          addLog('SUCCESS', `Request completed successfully via Primary Region (us-east-1).`);
          setTimeout(() => setActiveRoute('IDLE'), 2000);
          resolve({ success: true, region: 'us-east-1', model: payload.model || 'claude-3-5-sonnet' });
        }
      }, 1000);
    });
  }, [addLog]);

  return { gatewayLogs, activeRoute, executeGatewayRequest, addLog };
}
