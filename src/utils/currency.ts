export const CURRENCY_CONFIG = {
  USD: { symbol: '$', rate: 1.0, label: 'US Dollar (USD)' },
  EUR: { symbol: '€', rate: 0.92, label: 'Euro (EUR)' },
  GBP: { symbol: '£', rate: 0.78, label: 'British Pound (GBP)' }
};

export function getFormattedCost(usdAmount: number, currency: 'USD' | 'EUR' | 'GBP', decimals = 4) {
  const config = CURRENCY_CONFIG[currency];
  const converted = usdAmount * config.rate;
  return `${config.symbol}${converted.toFixed(decimals)}`;
}
