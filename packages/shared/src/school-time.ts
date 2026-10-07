import { Temporal } from 'temporal-polyfill';

/** Only this adapter owns the Temporal implementation; wire values remain strings. */
export class SchoolTimeError extends Error {
  constructor(readonly code: 'INVALID_SCHOOL_TIMEZONE' | 'INVALID_CALENDAR_DATE' | 'INVALID_SCHOOL_WALL_TIME' | 'INVALID_INSTANT') {
    super(code);
    this.name = 'SchoolTimeError';
  }
}

export function validateSchoolTimezone(timezone: string): string {
  try {
    // Temporal also accepts offsets and ISO timestamps as zone-like input.
    // Accept named identifiers only, then let Temporal validate against zone data.
    if (!/^[A-Za-z_][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(timezone)) throw new RangeError();
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone);
    return timezone;
  } catch {
    throw new SchoolTimeError('INVALID_SCHOOL_TIMEZONE');
  }
}

export function calendarDate(value: string): string {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError();
    return Temporal.PlainDate.from(value, { overflow: 'reject' }).toString();
  } catch {
    throw new SchoolTimeError('INVALID_CALENDAR_DATE');
  }
}

export function isCalendarDate(value: string): boolean {
  try { return calendarDate(value) === value; } catch { return false; }
}

function zonedInstant(instant: string | Date, timezone: string) {
  validateSchoolTimezone(timezone);
  try {
    return Temporal.Instant.from(instant instanceof Date ? instant.toISOString() : instant).toZonedDateTimeISO(timezone);
  } catch {
    throw new SchoolTimeError('INVALID_INSTANT');
  }
}

export function schoolDateFromInstant(instant: string | Date, timezone: string): string {
  return zonedInstant(instant, timezone).toPlainDate().toString();
}

/** datetime-local contains wall-clock components, never a device-local instant. */
export function schoolWallTimeToInstant(value: string, timezone: string): string {
  validateSchoolTimezone(timezone);
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw new RangeError();
    return Temporal.PlainDateTime.from(value, { overflow: 'reject' })
      .toZonedDateTime(timezone, { disambiguation: 'reject' })
      .toInstant().toString({ smallestUnit: 'millisecond' });
  } catch {
    throw new SchoolTimeError('INVALID_SCHOOL_WALL_TIME');
  }
}

/** Explicit zone label also distinguishes presentation from the persisted instant. */
export function formatSchoolInstant(instant: string | Date, timezone: string): string {
  const zoned = zonedInstant(instant, timezone);
  return `${zoned.toPlainDate().toString()} ${zoned.toPlainTime().toString({ smallestUnit: 'minute' })} (${timezone})`;
}
