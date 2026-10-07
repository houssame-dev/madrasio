// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calendarDate, formatSchoolInstant, schoolDateFromInstant, schoolWallTimeToInstant, validateSchoolTimezone } from '@school/shared';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';

describe('shared School time contract', () => {
  it.each(['UTC', 'America/New_York', 'Africa/Casablanca', 'Asia/Tokyo'])('validates IANA zone %s', (zone) => {
    expect(validateSchoolTimezone(zone)).toBe(zone);
  });
  it.each(['', 'Invalid/School', '+01:00', '-05:00', ' UTC ', '2026-06-15T12:00[America/New_York]', '2026-06-15T12:00+01:00'])('rejects zone %s without fallback', (zone) => {
    expect(() => schoolDateFromInstant('2026-06-15T00:00:00Z', zone)).toThrow('INVALID_SCHOOL_TIMEZONE');
    expect(() => schoolWallTimeToInstant('2026-06-15T12:00', zone)).toThrow('INVALID_SCHOOL_TIMEZONE');
  });
  it.each(['2026-06-15', '2024-02-29', '0001-01-01'])('round-trips offset-free date %s', (date) => {
    expect(calendarDate(date)).toBe(date);
  });
  it.each(['2026-02-29', '2026-13-01', '2026-06-15T00:00:00Z'])('rejects invalid date-only %s', (date) => {
    expect(() => calendarDate(date)).toThrow('INVALID_CALENDAR_DATE');
  });
  it('derives School today across midnight independently of the UTC date', () => {
    const instant = new Date('2026-06-15T00:30:00Z');
    expect(schoolCalendarToday('America/New_York', instant)).toBe('2026-06-14');
    expect(schoolCalendarToday('Africa/Casablanca', instant)).toBe('2026-06-15');
    expect(schoolDateFromInstant('2026-06-14T23:30:00Z', 'Africa/Casablanca')).toBe('2026-06-15');
  });
  it('resolves seasonal offsets and Morocco with timezone data, not hardcoded rules', () => {
    expect(schoolWallTimeToInstant('2026-06-15T12:00', 'America/New_York')).toBe('2026-06-15T16:00:00.000Z');
    expect(schoolWallTimeToInstant('2026-01-15T12:00', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(schoolWallTimeToInstant('2026-06-15T12:00', 'Africa/Casablanca')).toBe('2026-06-15T11:00:00.000Z');
    expect(schoolWallTimeToInstant('2026-03-01T12:00', 'Africa/Casablanca')).toBe('2026-03-01T12:00:00.000Z');
  });
  it.each(['2026-03-08T02:30', '2026-11-01T01:30', '2026-02-30T12:00', '2026-06-15T12:00Z'])('rejects gap/fold/invalid wall time %s', (wall) => {
    expect(() => schoolWallTimeToInstant(wall, 'America/New_York')).toThrow('INVALID_SCHOOL_WALL_TIME');
  });
  it('renders in the explicit School zone without rewriting the instant', () => {
    const stored = '2026-06-15T16:00:00.000Z';
    expect(formatSchoolInstant(stored, 'America/New_York')).toBe('2026-06-15 12:00 (America/New_York)');
    expect(formatSchoolInstant(stored, 'Asia/Tokyo')).toBe('2026-06-16 01:00 (Asia/Tokyo)');
    expect(stored).toBe('2026-06-15T16:00:00.000Z');
    expect(() => formatSchoolInstant('2026-06-15T12:00', 'UTC')).toThrow('INVALID_INSTANT');
  });
  it('produces identical values in independent UTC, American and Asian processes without global mutation', () => {
    const adapter = pathToFileURL(resolve('../../packages/shared/src/school-time.ts')).href;
    const program = `import { schoolWallTimeToInstant, calendarDate, schoolDateFromInstant, formatSchoolInstant } from ${JSON.stringify(adapter)};
      const before = globalThis.Temporal;
      console.log(JSON.stringify({ deviceZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        values: [schoolWallTimeToInstant('2026-06-15T12:00', 'America/New_York'), calendarDate('2026-06-15'),
          schoolDateFromInstant('2026-06-15T00:30:00Z', 'America/New_York'), formatSchoolInstant('2026-06-15T16:00:00Z', 'America/New_York')],
        noGlobalMutation: before === undefined && globalThis.Temporal === undefined }));`;
    const outputs = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((TZ) => JSON.parse(execFileSync(process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', program], { env: { ...process.env, TZ }, encoding: 'utf8' })));
    expect(new Set(outputs.map((o) => o.deviceZone)).size).toBe(3);
    for (const output of outputs) {
      expect(output.values).toEqual(['2026-06-15T16:00:00.000Z', '2026-06-15', '2026-06-14', '2026-06-15 12:00 (America/New_York)']);
      expect(output.noGlobalMutation).toBe(true);
    }
  });
});
