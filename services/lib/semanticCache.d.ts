declare module './semanticCache.js' {
  export function searchSemanticCache(prompt: string): Promise<string | null>;
  export function saveSemanticCache(prompt: string, response: string): Promise<void>;
  export const cacheConfigured: boolean;
}

export {};
