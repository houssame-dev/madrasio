/**
 * Exact decimal arithmetic for the Grades calculation engine (Task 006D Part A).
 *
 * All academic scores, coefficients, weights and results are `numeric` in
 * PostgreSQL and must NEVER be represented as IEEE-754 floats in the engine.
 * This module implements exact fixed-point arithmetic over `bigint` with an
 * internal scale of 12 decimal digits (`DECIMAL_SCALE`).
 *
 * Every `DecimalValue` is an immutable wrapper around one `bigint` where
 * `raw = value * 10^DECIMAL_SCALE`. Arithmetic is exact:
 *
 *   add/subtract  — same scale, plain bigint sum/difference
 *   multiply      — `(a * b) / 10^12`
 *   divide        — `(a * 10^12) / b`
 *
 * Rounding is explicit and only ever applied as the FINAL step of a
 * calculation (never mid-arithmetic), using one of the controlled
 * `RoundingMode`s. `NONE` keeps full internal precision.
 *
 * `toFixed(scale)` is a pure FORMATTER (it truncates the internal fraction to
 * the requested digits); it must only be called on an already-rounded value.
 * `toExactString()` returns the full internal precision, trimmed of trailing
 * fractional zeros.
 */

export const DECIMAL_SCALE = 12;

import type { RoundingMode } from '../grading-rules';

const SCALE_FACTOR = 10n ** BigInt(DECIMAL_SCALE);

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d*))?$/;

function parseRaw(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('Invalid decimal: empty string');
  }
  let negative = false;
  let body = trimmed;
  if (body.startsWith('-')) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith('+')) {
    body = body.slice(1);
  }
  const match = DECIMAL_PATTERN.exec(body);
  if (match === null) {
    throw new Error(`Invalid decimal: "${value}"`);
  }
  const [, intPart, fracPartRaw] = match;
  let fracPart = fracPartRaw ?? '';
  if (fracPart.length > DECIMAL_SCALE) {
    fracPart = fracPart.slice(0, DECIMAL_SCALE);
  } else {
    fracPart = fracPart.padEnd(DECIMAL_SCALE, '0');
  }
  const scaled = BigInt(intPart) * SCALE_FACTOR + BigInt(fracPart);
  return negative ? -scaled : scaled;
}

export class DecimalValue {
  /** Internal value at `DECIMAL_SCALE`. Never mutate. */
  public readonly raw: bigint;

  private constructor(raw: bigint) {
    this.raw = raw;
  }

  static get ZERO(): DecimalValue {
    return new DecimalValue(0n);
  }

  static get ONE(): DecimalValue {
    return new DecimalValue(SCALE_FACTOR);
  }

  static fromRaw(raw: bigint): DecimalValue {
    return new DecimalValue(raw);
  }

  /** Parses a numeric string (or finite JS number via String()) exactly. */
  static parse(value: string | number): DecimalValue {
    const text = typeof value === 'number' ? String(value) : value;
    return new DecimalValue(parseRaw(text));
  }

  /** Integer constructor (e.g. counts, whole-number weights). */
  static fromInteger(value: bigint | number): DecimalValue {
    const int = typeof value === 'number' ? BigInt(value) : value;
    return new DecimalValue(int * SCALE_FACTOR);
  }

  add(other: DecimalValue): DecimalValue {
    return new DecimalValue(this.raw + other.raw);
  }

  subtract(other: DecimalValue): DecimalValue {
    return new DecimalValue(this.raw - other.raw);
  }

  multiply(other: DecimalValue): DecimalValue {
    return new DecimalValue((this.raw * other.raw) / SCALE_FACTOR);
  }

  divide(other: DecimalValue): DecimalValue {
    if (other.raw === 0n) {
      throw new Error('Division by zero in DecimalValue');
    }
    return new DecimalValue((this.raw * SCALE_FACTOR) / other.raw);
  }

  negate(): DecimalValue {
    return new DecimalValue(-this.raw);
  }

  eq(other: DecimalValue): boolean {
    return this.raw === other.raw;
  }

  gt(other: DecimalValue): boolean {
    return this.raw > other.raw;
  }

  gte(other: DecimalValue): boolean {
    return this.raw >= other.raw;
  }

  lt(other: DecimalValue): boolean {
    return this.raw < other.raw;
  }

  lte(other: DecimalValue): boolean {
    return this.raw <= other.raw;
  }

  isZero(): boolean {
    return this.raw === 0n;
  }

  isPositive(): boolean {
    return this.raw > 0n;
  }

  /**
   * Rounds to `scale` decimal digits using `mode` and returns a NEW
   * DecimalValue still stored at full internal precision (so rounding can be
   * chained safely). `NONE` returns the value unchanged.
   */
  round(mode: RoundingMode, scale: number): DecimalValue {
    if (scale < 0 || scale > DECIMAL_SCALE) {
      throw new Error(`Rounding scale must be between 0 and ${DECIMAL_SCALE}`);
    }
    if (mode === 'NONE') {
      return this;
    }
    const scaleDiff = DECIMAL_SCALE - scale;
    if (scaleDiff === 0) {
      return this;
    }
    const divisor = 10n ** BigInt(scaleDiff);
    const quotient = this.raw / divisor;
    const remainder = this.raw % divisor;
    const absRemainder = remainder < 0n ? -remainder : remainder;
    const sign = this.raw < 0n ? -1n : 1n;
    const twice = absRemainder * 2n;

    let rounded = quotient;
    if (mode === 'HALF_UP') {
      if (twice >= divisor) {
        rounded = quotient + BigInt(sign);
      }
    } else if (mode === 'HALF_DOWN') {
      if (twice > divisor) {
        rounded = quotient + BigInt(sign);
      }
    } else if (mode === 'HALF_EVEN') {
      if (twice > divisor) {
        rounded = quotient + BigInt(sign);
      } else if (twice === divisor) {
        const absQuotient = quotient < 0n ? -quotient : quotient;
        if (absQuotient % 2n !== 0n) {
          rounded = quotient + BigInt(sign);
        }
      }
    }
    return new DecimalValue(rounded * divisor);
  }

  /** Exact string with full internal precision, trailing fractional zeros trimmed. */
  toExactString(): string {
    const negative = this.raw < 0n;
    const abs = negative ? -this.raw : this.raw;
    const intPart = abs / SCALE_FACTOR;
    const fracPart = abs % SCALE_FACTOR;
    const sign = negative ? '-' : '';
    if (fracPart === 0n) {
      return `${sign}${intPart.toString()}`;
    }
    const frac = fracPart.toString().padStart(DECIMAL_SCALE, '0').replace(/0+$/, '');
    return `${sign}${intPart.toString()}.${frac}`;
  }

  /**
   * Formats to exactly `scale` decimal digits (0-padded). Purely a formatter —
   * call this only on a value that was already rounded to `scale` so that no
   * silent precision loss occurs here.
   */
  toFixed(scale: number): string {
    if (scale < 0 || scale > DECIMAL_SCALE) {
      throw new Error(`Formatting scale must be between 0 and ${DECIMAL_SCALE}`);
    }
    const negative = this.raw < 0n;
    const abs = negative ? -this.raw : this.raw;
    const intPart = abs / SCALE_FACTOR;
    const fracDigits = (abs % SCALE_FACTOR).toString().padStart(DECIMAL_SCALE, '0');
    const frac = fracDigits.slice(0, scale);
    return `${negative ? '-' : ''}${intPart.toString()}.${frac}`;
  }
}