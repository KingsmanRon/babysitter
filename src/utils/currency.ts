/**
 * Format a number as South African Rand using the en-ZA locale.
 * Uses Intl.NumberFormat for proper thousand separators and currency symbol.
 */
export const formatZAR = (amount: number): string => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};
