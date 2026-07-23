import Constants from 'expo-constants';

export const API_URL = Constants.expoConfig?.extra?.apiUrl 
  ?? process.env.API_URL 
  ?? 'http://localhost:9900';

export const ENDPOINTS = {
  HEALTH_CHECK: '/api/health-check',
  TELEMETRY_FEED: '/api/telemetry/logs',
  GOVERNANCE_FEED: '/api/governance/feed',
  COMMUNITY_VALUE: '/api/metrics/community-value',
  INTERCEPTOR_VERIFY: '/api/interceptor/verify',
  INTERCEPTOR_TRIAGE: '/api/interceptor/triage'
} as const;
