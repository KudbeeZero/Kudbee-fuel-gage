import { createContext, useContext } from 'react';

export interface DeepLinkContextValue {
  logId: string | undefined;
  tab: string | undefined;
}

export const DeepLinkContext = createContext<DeepLinkContextValue>({ logId: undefined, tab: undefined });

export function useDeepLink(): DeepLinkContextValue {
  return useContext(DeepLinkContext);
}
