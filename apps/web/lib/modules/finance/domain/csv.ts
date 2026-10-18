/** Every cell is quoted; prefix dangerous text before CSV quoting, including whitespace-obscured formulas. */
export function csvDocument(rows: readonly (readonly (string | number)[])[]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value);
    const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n') + '\r\n';
}
export const decimalMoney = (cents: number) => `${BigInt(cents) / 100n}.${String(BigInt(cents) % 100n).padStart(2, '0')}`;
/** Format aggregate centimes without losing the last cent through division at large totals. */
export function formatMoney(cents: number, locale: string, currency: string) {
  const value = BigInt(cents);
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / 100n;
  const fraction = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2 }).format(Number(magnitude % 100n));
  // Keep a negative sign even for amounts between -0.99 and zero.
  const integral = value < 0n ? (whole === 0n ? -0 : -whole) : whole;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(integral).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}
