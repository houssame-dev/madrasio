/** Every cell is quoted; prefix dangerous text before CSV quoting, including whitespace-obscured formulas. */
export function csvDocument(rows: readonly (readonly (string | number)[])[]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value);
    const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n') + '\r\n';
}
export const decimalMAD = (cents: number) => `${BigInt(cents) / 100n}.${String(BigInt(cents) % 100n).padStart(2, '0')}`;
/** Format aggregate centimes without losing the last cent through division at large totals. */
export function formatMAD(cents: number, locale: string) {
  const value = BigInt(cents);
  const fraction = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2 }).format(Number(value % 100n));
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'MAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(value / 100n).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}
