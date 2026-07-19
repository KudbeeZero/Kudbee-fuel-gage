export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://kudbee-fuel-gage.herokuapp.com';

export const ENDPOINTS = {
  HEALTH_CHECK: '/api/health-check',
  TELEMETRY_FEED: '/api/telemetry/logs',
  GOVERNANCE_FEED: '/api/governance/feed',
  COMMUNITY_VALUE: '/api/metrics/community-value',
  INTERCEPTOR_VERIFY: '/api/interceptor/verify',
  INTERCEPTOR_TRIAGE: '/api/interceptor/triage'
} as const;
