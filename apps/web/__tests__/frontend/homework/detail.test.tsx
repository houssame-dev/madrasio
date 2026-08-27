import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeworkDetailWorkspace } from '@/components/homework/homework-detail';
import type { HomeworkDto, HomeworkRosterSubmissionDto, HomeworkSubmissionDto, HomeworkTargetDto } from '@/lib/frontend/homework/types';
import { assignmentA, assignmentB, classA, classAId, classB, classBId, homework, homeworkId, page, period, publishedHomework, renderHomework, roster, rosterSubmission, student, studentId, subject, submission, submissionId, target, teacher, teacherId, year, yearId } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

function setup(options: { value?: HomeworkDto; targets?: HomeworkTargetDto[]; rosterValue?: HomeworkRosterSubmissionDto | null; submissionValue?: HomeworkSubmissionDto; parent?: boolean; detailError?: boolean } = {}) {
  const value = options.value ?? homework; const targets = options.targets ?? []; const rosterValue = options.rosterValue === undefined ? null : options.rosterValue; const submissionValue = options.submissionValue ?? submission;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); const method = (init as RequestInit | undefined)?.method;
    if (url === `/api/v1/homeworks/${homeworkId}` && !method) return options.detailError ? Response.json({ error: { code: 'NOT_FOUND', featureCode: 'HOMEWORK_NOT_FOUND', message: 'hidden' } }, { status: 404 }) : Response.json({ data: value });
    if (options.parent) {
      if (url === `/api/v1/homeworks/${homeworkId}/submissions?page=1&pageSize=100`) return Response.json(page([submissionValue], 1, 100));
      if (url === '/api/v1/me/parent-profiles') return Response.json({ data: [{ parent: { id: crypto.randomUUID(), firstName: 'Nadia', lastName: 'Amrani', status: 'ACTIVE' }, children: [{ relationshipId: crypto.randomUUID(), student: { id: studentId, firstName: student.firstName, lastName: student.lastName, studentCode: student.studentCode } }] }] });
      throw new Error(`Unexpected Parent request: ${url}`);
    }
    if (url === '/api/v1/academic-years?page=1&pageSize=100') return Response.json(page([year], 1, 100));
    if (url === '/api/v1/subjects?page=1&pageSize=100') return Response.json(page([subject], 1, 100));
    if (url === '/api/v1/classes?page=1&pageSize=100') return Response.json(page([classA, classB], 1, 100));
    if (url === `/api/v1/academic-years/${yearId}/periods?page=1&pageSize=100`) return Response.json(page([period], 1, 100));
    if (url === '/api/v1/teachers?status=ACTIVE&page=1&pageSize=100') return Response.json(page([teacher], 1, 100));
    if (url === `/api/v1/teachers/${teacherId}/assignments?status=ACTIVE&page=1&pageSize=100`) return Response.json(page([assignmentA, assignmentB], 1, 100));
    if (url === `/api/v1/teachers/${teacherId}`) return Response.json({ data: teacher });
    if (url === `/api/v1/homeworks/${homeworkId}/targets` && !method) return Response.json({ data: targets });
    if (url === `/api/v1/homeworks/${homeworkId}/students?page=1&pageSize=50`) return Response.json(roster(rosterValue));
    if (url === `/api/v1/homeworks/${homeworkId}/targets` && method === 'POST') return Response.json({ data: [target] }, { status: 201 });
    if (url === `/api/v1/homeworks/${homeworkId}/submissions` && method === 'POST') return Response.json({ data: submissionValue }, { status: 201 });
    if (url === `/api/v1/homework-submissions/${submissionId}` && !method) return Response.json({ data: submissionValue });
    if (url === `/api/v1/homework-submissions/${submissionId}` && method === 'PATCH') return Response.json({ data: { ...submissionValue, status: 'LATE' } });
    if (url === `/api/v1/homework-submissions/${submissionId}/review` && method === 'POST') return Response.json({ data: { ...submissionValue, status: 'REVIEWED' } });
    if (url === `/api/v1/homeworks/${homeworkId}` && method === 'PATCH') return Response.json({ data: { ...value, status: 'PUBLISHED' } });
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Homework detail lifecycle and targets', () => {
  it('exposes only DRAFT → PUBLISHED with confirmation and no archive shortcut', async () => {
    const fetchMock = setup(); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); await screen.findByText('Complete the exercises.'); expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument(); await userEvent.click(screen.getByRole('button', { name: 'Publish' })); expect(screen.getByText(/freezes its structure and targets/)).toBeInTheDocument(); await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homeworks/${homeworkId}` && (init as RequestInit | undefined)?.method === 'PATCH' && JSON.parse(String((init as RequestInit).body)).status === 'PUBLISHED')).toBe(true));
  });

  it('adds multiple CLASS targets through the dedicated endpoint and exposes no removal UI', async () => {
    const fetchMock = setup(); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); await screen.findByText('No Classes are targeted yet.'); await userEvent.click(screen.getByLabelText('Class A')); await userEvent.click(screen.getByLabelText('Class B')); await userEvent.click(screen.getByRole('button', { name: 'Add Class targets' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homeworks/${homeworkId}/targets` && (init as RequestInit | undefined)?.method === 'POST' && JSON.stringify(JSON.parse(String((init as RequestInit).body)).classIds) === JSON.stringify([classAId, classBId]))).toBe(true));
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('freezes target controls after publication', async () => {
    setup({ value: publishedHomework, targets: [target] }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); expect(await screen.findByText('Targets are frozen after publication. The committed API has no target deletion operation.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Add Class targets' })).not.toBeInTheDocument();
  });
});

describe('authoritative Homework roster and Submission lifecycle', () => {
  it('uses only the authoritative roster and renders historical Student eligibility with null as Not submitted', async () => {
    const fetchMock = setup({ value: publishedHomework }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); expect(await screen.findByText('Sara Amrani')).toBeInTheDocument(); expect(screen.getByText('Not submitted')).toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => String(url) === `/api/v1/homeworks/${homeworkId}/students?page=1&pageSize=50`)).toBe(true); expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/v1/students?'))).toBe(false);
  });

  it('creates one Submission without client status/timestamps and calls no coupled domain API', async () => {
    const fetchMock = setup({ value: publishedHomework }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); await userEvent.click(await screen.findByRole('button', { name: 'Record Submission' })); await userEvent.type(screen.getByLabelText('Submission content'), 'Answer text'); const actions = screen.getAllByRole('button', { name: 'Record Submission' }); await userEvent.click(actions[actions.length - 1]!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homeworks/${homeworkId}/submissions` && (init as RequestInit | undefined)?.method === 'POST')).toBe(true)); const call = fetchMock.mock.calls.find(([url, init]) => String(url) === `/api/v1/homeworks/${homeworkId}/submissions` && (init as RequestInit | undefined)?.method === 'POST'); const payload = JSON.parse(String((call?.[1] as RequestInit).body)); expect(payload).toEqual({ studentId, content: 'Answer text' }); expect(payload).not.toHaveProperty('status'); expect(payload).not.toHaveProperty('submittedAt'); expect(fetchMock.mock.calls.some(([url]) => /grade|assessment|result|attendance|notification|outbox/.test(String(url)))).toBe(false);
  });

  it('displays server LATE status and reviews through the exact action endpoint without Grade fields', async () => {
    const fetchMock = setup({ value: publishedHomework, rosterValue: rosterSubmission }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); await userEvent.click(await screen.findByRole('button', { name: 'Open Submission' })); expect((await screen.findAllByText('LATE')).length).toBeGreaterThan(0); await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' })); await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homework-submissions/${submissionId}/review` && JSON.parse(String((init as RequestInit).body)).status === 'REVIEWED')).toBe(true));
  });

  it('resubmits RETURNED work through PATCH on the same logical row with content only', async () => {
    const returned = { ...submission, status: 'RETURNED' as const }; const returnedRoster = { ...rosterSubmission, status: 'RETURNED' as const }; const fetchMock = setup({ value: publishedHomework, rosterValue: returnedRoster, submissionValue: returned }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); await userEvent.click(await screen.findByRole('button', { name: 'Open Submission' })); await userEvent.click(await screen.findByRole('button', { name: 'Resubmit returned work' })); const content = screen.getByLabelText('Submission content'); await userEvent.clear(content); await userEvent.type(content, 'Revised'); await userEvent.click(screen.getByRole('button', { name: 'Resubmit returned work' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homework-submissions/${submissionId}` && (init as RequestInit | undefined)?.method === 'PATCH' && JSON.parse(String((init as RequestInit).body)).content === 'Revised')).toBe(true)); expect(fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/v1/homeworks/${homeworkId}/submissions` && (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });
});

describe('Parent and tenant-safe detail behavior', () => {
  it('renders a related-child read-only direct resource without targets, roster, or writes', async () => {
    const fetchMock = setup({ value: publishedHomework, parent: true }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />, 'PARENT'); expect(await screen.findByText('Sara Amrani')).toBeInTheDocument(); expect(screen.getByText('My answer')).toBeInTheDocument(); expect(screen.queryByText('Class targets')).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/students'))).toBe(false); expect(fetchMock.mock.calls.some(([, init]) => ['POST', 'PATCH'].includes((init as RequestInit | undefined)?.method ?? ''))).toBe(false);
  });

  it('maps foreign Homework to a safe unavailable state', async () => {
    setup({ detailError: true }); renderHomework(<HomeworkDetailWorkspace homeworkId={homeworkId} />); expect(await screen.findByText('This Homework is unavailable or outside your current access.')).toBeInTheDocument(); expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });
});
