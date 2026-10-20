import { createHash } from 'node:crypto';
import { daysSchema } from '@/lib/modules/timetable/domain/contracts';
import { validatePeriods } from '@/lib/modules/finance/domain/contracts';
import { validateGradingRules } from '@/lib/modules/grades/domain/grading-rules';

export const DATASET = 'descartes-2026-v1';
export const SCHOOL_ID = fixtureId('school');
export const SUBJECTS = ['Mathématiques', 'Activité scientifique', 'Arabe', 'Français', 'Éducation islamique', 'Éducation artistique'];
export const ACCOUNT_KEYS = ['admin', ...SUBJECTS.map((_, i) => `teacher-${i + 1}`), ...[1, 2, 3, 4, 205].map(i => `parent-${i}`)];
export const emailFor = (key: string) => `${DATASET}.${key}@example.test`;
export function fixtureId(key: string) {
  const hex = createHash('sha256').update(`${DATASET}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export type SeedRow = Record<string, unknown> & { id: string };
export interface SeedBatch { table: string; rows: SeedRow[] }
const firstNames = ['Amine', 'Salma', 'Youssef', 'Aya', 'Adam', 'Lina', 'Ilyas', 'Nour', 'Omar', 'Malak', 'Yassine', 'Hiba', 'Anas', 'Sara', 'Mehdi', 'Inès', 'Rayan', 'Kenza', 'Hamza', 'Rim', 'Idriss', 'Dina', 'Soufiane'];
const familyNames = ['El Mansouri', 'Bennani', 'Alaoui', 'Idrissi', 'Amrani', 'Berrada', 'Tazi', 'El Fassi', 'Chraïbi', 'Benkirane', 'Ziani', 'Lahlou'];
const adultNames = ['Mounir', 'Latifa', 'Hicham', 'Asma', 'Bouchra', 'Khalid', 'Said', 'Amina', 'Younes', 'Khadija', 'Abdelaziz', 'Naima', 'Meriem', 'Mustapha', 'Hassan', 'Souad', 'Mohamed', 'Zineb', 'Abdelilah', 'Nawal'];
const parentSurname = (i: number) => familyNames[Math.floor(i / adultNames.length) % familyNames.length];
// Sibling families span first and sixth year; avoid fabricating 36 same-grade twin families.
const parentForStudent = (i: number) => i < 36 ? 204 + i : i >= 230 && i < 266 ? 204 + i - 230 : i < 230 ? i - 36 : 194 + i - 266;
export const GRADING = {
  schemaVersion: 1, periodCalculation: { mode: 'WEIGHTED_AVERAGE' }, annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: { mode: 'EQUAL' }, coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
  rounding: { mode: 'HALF_UP', scale: 2 }, thresholds: { maxScore: 10, passingScore: 5 },
};
export const DAYS = [1, 2, 3, 4, 5].map(day => ({ day, slots: [
  { kind: 'LESSON' as const, start: '08:30', end: '09:20' }, { kind: 'LESSON' as const, start: '09:20', end: '10:10' },
  { kind: 'BREAK' as const, start: '10:10', end: '10:30' }, { kind: 'LESSON' as const, start: '10:30', end: '11:20' },
  { kind: 'LESSON' as const, start: '11:20', end: '12:10' }, { kind: 'BREAK' as const, start: '12:10', end: '13:30' },
  { kind: 'LESSON' as const, start: '13:30', end: '14:20' }, { kind: 'LESSON' as const, start: '14:20', end: '15:10' },
  { kind: 'BREAK' as const, start: '15:10', end: '15:25' }, { kind: 'LESSON' as const, start: '15:25', end: '16:15' },
] }));

/** Pure, deterministic prerequisites only. Auth UUIDs are supplied by the supported Admin API. */
export function buildDescartesPlan(identities: Record<string, string> = Object.fromEntries(ACCOUNT_KEYS.map(k => [k, fixtureId(`auth:${k}`)]))): SeedBatch[] {
  const batches: SeedBatch[] = [];
  const add = (table: string, rows: SeedRow[]) => batches.push({ table, rows });
  const row = (key: string, values: Record<string, unknown>): SeedRow => ({ id: fixtureId(key), school_id: SCHOOL_ID, ...values });
  const year = fixtureId('year'), stage = fixtureId('stage'), admin = identities.admin;
  if (ACCOUNT_KEYS.some(key => !identities[key] || !/^[0-9a-f-]{36}$/.test(identities[key])) || new Set(Object.values(identities)).size !== 12) throw Error('INVALID_IDENTITY_MAP');
  add('users', ACCOUNT_KEYS.map(key => ({ id: identities[key], email: emailFor(key), status: 'ACTIVE', is_platform_admin: false })));
  add('schools', [{ id: SCHOOL_ID, name: 'Descartes School', status: 'ACTIVE', timezone: 'Africa/Casablanca', finance_currency: 'MAD' }]);
  add('school_memberships', ACCOUNT_KEYS.map(key => row(`membership:${key}`, { user_id: identities[key], role: key === 'admin' ? 'SCHOOL_ADMIN' : key.startsWith('teacher') ? 'TEACHER' : 'PARENT', status: 'ACTIVE' })));
  add('academic_years', [row('year', { name: '2026/2027', start_date: '2026-09-01', end_date: '2027-05-30', status: 'ACTIVE' })]);
  add('academic_periods', [row('period:1', { academic_year_id: year, name: 'Premier semestre', sequence: 1, start_date: '2026-09-01', end_date: '2027-01-31', status: 'ACTIVE' }), row('period:2', { academic_year_id: year, name: 'Deuxième semestre', sequence: 2, start_date: '2027-02-01', end_date: '2027-05-30', status: 'PLANNED' })]);
  add('stages', [row('stage', { name: 'Primaire', sequence: 1, status: 'ACTIVE' })]);
  add('levels', Array.from({ length: 6 }, (_, i) => row(`level:${i}`, { stage_id: stage, name: `${i + 1}${i === 0 ? 'ère' : 'ème'} année`, sequence: i + 1, status: 'ACTIVE' })));
  add('subjects', SUBJECTS.map((name, i) => row(`subject:${i}`, { name, code: `DESC-S${i + 1}`, status: 'ACTIVE' })));
  add('curricula', SUBJECTS.map((_, i) => row(`curriculum:${i}`, { name: `Programme primaire — ${i + 1}${i === 0 ? 'ère' : 'ème'} année`, status: 'ACTIVE' })));
  add('curriculum_versions', SUBJECTS.map((_, i) => row(`version:${i}`, { curriculum_id: fixtureId(`curriculum:${i}`), name: '2026/2027 — V1', status: 'ACTIVE' })));
  add('curriculum_subjects', SUBJECTS.flatMap((_, level) => SUBJECTS.map((__, subject) => row(`curriculum-subject:${level}:${subject}`, { curriculum_version_id: fixtureId(`version:${level}`), subject_id: fixtureId(`subject:${subject}`), coefficient: '1.00', display_order: subject + 1, status: 'ACTIVE' }))));
  add('classes', Array.from({ length: 12 }, (_, i) => row(`class:${i}`, { academic_year_id: year, level_id: fixtureId(`level:${Math.floor(i / 2)}`), track_id: null, curriculum_version_id: fixtureId(`version:${Math.floor(i / 2)}`), name: `${Math.floor(i / 2) + 1}${i % 2 === 0 ? 'A' : 'B'}`, status: 'ACTIVE' })));
  add('students', Array.from({ length: 276 }, (_, i) => {
    const level = Math.floor(i / 46), family = parentForStudent(i);
    return row(`student:${i}`, { first_name: firstNames[(i % 23 + Math.floor(i / 23)) % firstNames.length], last_name: parentSurname(family), student_code: `DESC-2026-${String(i + 1).padStart(3, '0')}`, date_of_birth: `${2020 - level}-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 27 + 1).padStart(2, '0')}`, status: 'ACTIVE' });
  }));
  add('student_enrollments', Array.from({ length: 276 }, (_, i) => row(`enrollment:${i}`, { student_id: fixtureId(`student:${i}`), academic_year_id: year, class_id: fixtureId(`class:${Math.floor(i / 23)}`), effective_from: '2026-09-01', effective_until: null, status: 'ACTIVE' })));
  add('teachers', SUBJECTS.map((_, i) => row(`teacher:${i}`, { user_id: identities[`teacher-${i + 1}`], first_name: ['Nadia', 'Karim', 'Samira', 'Rachid', 'Fatima', 'Adil'][i], last_name: familyNames[i], teacher_code: `DESC-T${i + 1}`, status: 'ACTIVE' })));
  add('teacher_assignments', Array.from({ length: 12 }, (_, c) => SUBJECTS.map((_, i) => row(`assignment:${c}:${i}`, { teacher_id: fixtureId(`teacher:${i}`), class_id: fixtureId(`class:${c}`), subject_id: fixtureId(`subject:${i}`), academic_year_id: year, effective_from: '2026-09-01', effective_until: '2027-05-30', status: 'ACTIVE' }))).flat());
  add('parents', Array.from({ length: 240 }, (_, i) => row(`parent:${i}`, { user_id: identities[`parent-${i + 1}`] ?? null, first_name: adultNames[i % adultNames.length], last_name: parentSurname(i), parent_code: `DESC-P${String(i + 1).padStart(3, '0')}`, status: 'ACTIVE' })));
  add('parent_students', Array.from({ length: 276 }, (_, i) => row(`relationship:${i}`, { parent_id: fixtureId(`parent:${parentForStudent(i)}`), student_id: fixtureId(`student:${i}`), status: 'ACTIVE' })));
  add('grading_configurations', [row('grading', { name: 'Primaire — notation sur 10', status: 'ACTIVE' })]);
  add('grading_configuration_versions', [row('grading-version', { grading_configuration_id: fixtureId('grading'), version_number: 1, status: 'ACTIVE', rules: GRADING })]);
  add('timetable_rooms', Array.from({ length: 15 }, (_, i) => row(`room:${i}`, { name: i < 12 ? `Salle ${String(i + 1).padStart(2, '0')}` : ['Laboratoire scientifique', 'Atelier artistique', 'Salle polyvalente'][i - 12], kind: i === 12 ? 'LAB' : 'ROOM', active: true, revision: 1, created_by: admin, updated_by: admin })));
  add('timetable_configurations', [row('week', { academic_year_id: year, stage_id: null, level_id: null, scope_key: 'school', revision: 1, enabled: true, days: DAYS, created_by: admin })]);
  const fees = [ ['Assurance scolaire', 50000, 'ONCE'], ["Frais d'inscription", 150000, 'ONCE'], ['Transport scolaire', 70000, 'MONTHLY'], ['Frais de scolarité', 250000, 'MONTHLY'] ] as const;
  add('finance_fee_types', fees.map(([name], i) => row(`fee:${i}`, { name, active: true })));
  add('finance_fee_structures', fees.map(([, amount, cadence], i) => {
    const periods = cadence === 'ONCE' ? [{ period: 'once', dueDate: '2026-09-01' }] : Array.from({ length: 9 }, (_, m) => { const period = `${m < 4 ? 2026 : 2027}-${String((m + 8) % 12 + 1).padStart(2, '0')}`; return { period, dueDate: `${period}-01` }; });
    validatePeriods(cadence, periods, { startDate: '2026-09-01', endDate: '2027-05-30' });
    return row(`structure:${i}`, { academic_year_id: year, fee_type_id: fixtureId(`fee:${i}`), level_id: null, cadence, amount_cents: amount, currency: 'MAD', periods, active: true, revision: 1, created_by: admin, updated_by: admin });
  }));
  daysSchema.parse(DAYS);
  if (validateGradingRules(GRADING).length) throw Error('INVALID_GRADING');
  return batches;
}

export function descartesManifest() {
  const batches = buildDescartesPlan();
  return { dataset: DATASET, school: { id: SCHOOL_ID, name: 'Descartes School', timezone: 'Africa/Casablanca', currency: 'MAD', countryDescription: 'Morocco (descriptive only)' },
    counts: Object.fromEntries(batches.map(b => [b.table, b.rows.length])), classes: batches.find(b => b.table === 'classes')!.rows.map(r => ({ name: r.name, students: 23 })),
    parents: { singleChild: 204, twoChildren: 36, totalRelationships: 276 }, subjects: SUBJECTS, coefficient: '1.00', grading: GRADING, timetable: DAYS,
    feeTypes: batches.find(b => b.table === 'finance_fee_types')!.rows, fees: batches.find(b => b.table === 'finance_fee_structures')!.rows,
    accounts: ACCOUNT_KEYS.map(key => ({ key, email: emailFor(key), preferredLanguage: 'fr', twoChildren: key === 'parent-205' })),
    language: 'French browser locale cookie must be selected; Auth metadata is descriptive, not an application authority.', authUuidPolicy: 'Preview placeholders are replaced with exact Auth Admin UUIDs at apply.',
    operationalRecords: 0, warning: 'Six specialist teachers provide 210 teacher-slots/week versus 420 class-slots/week. No complete conflict-free timetable is promised or generated.' };
}
