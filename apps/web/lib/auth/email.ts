/**
 * Canonical V1 application email representation.
 *
 * Validation is intentionally separate. Do not add provider-specific
 * transformations (for example plus-tag or dot removal) here.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
