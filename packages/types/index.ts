export type FirewallConfig = Readonly<{
  blockPromptInjection: boolean;
  rateLimitByIp: boolean;
}>;