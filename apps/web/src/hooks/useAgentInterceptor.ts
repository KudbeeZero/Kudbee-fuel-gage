import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

export type ActionJson = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface ProxyPendingItem {
  id: string;
  payload?: ActionJson;
}

export interface PendingApproval {
  id: string;
  agentId: string;
  triggeredRule: string;
  actionJson: ActionJson;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timestamp: Date;
}

export function useAgentInterceptor() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await apiGet<ProxyPendingItem[]>('/api/proxy/pending');
        setPendingApprovals(prev => {
          const merged = [...prev];
          data.forEach((item) => {
            if (!merged.find(p => p.id === item.id)) {
              merged.push({
                id: item.id,
                agentId: 'HTTP_PROXY_CLIENT',
                triggeredRule: 'API_INTERCEPT',
                actionJson: item.payload ?? null,
                resolve: () => {},
                reject: () => {},
                timestamp: new Date()
              });
            }
          });
          return merged;
        });
      } catch (_e: unknown) {
      }
    };
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, []);

  const executeAgentTool = useCallback((agentId: string, triggeredRule: string, actionJson: ActionJson) => {
    return new Promise<void>((resolve, reject) => {
      const id = "agent-tx-" + Math.floor(1000 + Math.random() * 9000);
      const newApproval: PendingApproval = {
        id,
        agentId,
        triggeredRule,
        actionJson,
        resolve,
        reject,
        timestamp: new Date()
      };
      setPendingApprovals(prev => [...prev, newApproval]);
    });
  }, []);

  const resolveApproval = useCallback(async (id: string, actionJson?: ActionJson) => {
    setPendingApprovals(prev => {
      const approval = prev.find(p => p.id === id);
      if (approval) {
        if (approval.agentId === 'HTTP_PROXY_CLIENT') {
           apiPost('/api/proxy/resolve', {
             id, action: 'approve', modifiedPayload: actionJson || approval.actionJson
           }).catch(console.error);
        } else {
           approval.resolve();
        }
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const rejectApproval = useCallback(async (id: string, rejectReason?: string) => {
    setPendingApprovals(prev => {
      const approval = prev.find(p => p.id === id);
      if (approval) {
        if (approval.agentId === 'HTTP_PROXY_CLIENT') {
           apiPost('/api/proxy/resolve', {
             id, action: 'reject', rejectReason
           }).catch(console.error);
        } else {
           approval.reject(new Error(rejectReason || "Execution Denied"));
        }
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  return { pendingApprovals, executeAgentTool, resolveApproval, rejectApproval };
}
