const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function formatINR(amount: number | string): string {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!isFinite(num)) return '₹0.00';
  return inrFormatter.format(num);
}


