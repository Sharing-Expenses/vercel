/** Parse user input like "43,09" or "43.09" into integer cents. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function formatMoney(cents: number, currency = "EUR", locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
