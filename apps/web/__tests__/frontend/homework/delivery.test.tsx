import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { HomeworkRoster } from '@/components/homework/homework-roster';
import { SubmissionForm } from '@/components/homework/submission-form';
import { SubmissionTiming } from '@/components/homework/submission-timing';
import { SubmissionAttachments } from '@/components/homework/submission-attachments';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { publishedHomework, renderHomework, roster, rosterSubmission, schoolId, studentId, submission, submissionId } from './test-helpers';
afterEach(() => vi.restoreAllMocks());

it.each(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED'] as const)('renders Delivered independently of %s and retains returned follow-up', async (status) => {
  vi.spyOn(homeworkApi, 'roster').mockResolvedValue(roster({ ...rosterSubmission, status }));
  renderHomework(<HomeworkRoster schoolId={schoolId} homework={publishedHomework} />);
  expect(await screen.findByText('Delivered')).toBeInTheDocument(); expect(screen.getByText(status)).toBeInTheDocument();
  expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
  if (status === 'RETURNED') expect(screen.getByText(/Follow-up is required/)).toBeInTheDocument();
});
it('renders no record as Not delivered without a fake status', async () => {
  vi.spyOn(homeworkApi, 'roster').mockResolvedValue(roster(null));
  renderHomework(<HomeworkRoster schoolId={schoolId} homework={publishedHomework} />);
  expect(await screen.findByText('Not delivered')).toBeInTheDocument(); expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
});
it('preserves legacy unknown actual time and formats recording in School rather than browser time', () => {
  renderHomework(<SubmissionTiming submittedAt="2025-10-10T23:30:00Z" actualHandedInAt={null} />, 'TEACHER', 'Pacific/Kiritimati');
  expect(screen.getByText('2025-10-11 13:30 (Pacific/Kiritimati)')).toBeInTheDocument();
  expect(screen.getByText('Unknown — lateness uses recording time')).toBeInTheDocument();
});
it('converts optional School wall time to an offset-bearing instant, never client authority fields', async () => {
  const create = vi.spyOn(homeworkApi, 'createSubmission').mockResolvedValue(submission);
  renderHomework(<SubmissionForm schoolId={schoolId} homeworkId={publishedHomework.id} studentId={studentId} onCancel={() => {}} onSaved={() => {}} />, 'TEACHER', 'Pacific/Kiritimati');
  fireEvent.change(screen.getByLabelText('Actual hand-in time (optional)'), { target: { value: '2025-10-10T09:30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Record Submission' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(publishedHomework.id, { studentId, content: null, actualHandedInAt: '2025-10-09T19:30:00.000Z' }));
});
it('rejects ambiguous School-local wall times without sending a recording', async () => {
  const create = vi.spyOn(homeworkApi, 'createSubmission').mockResolvedValue(submission);
  renderHomework(<SubmissionForm schoolId={schoolId} homeworkId={publishedHomework.id} studentId={studentId} onCancel={() => {}} onSaved={() => {}} />, 'TEACHER', 'America/New_York');
  fireEvent.change(screen.getByLabelText('Actual hand-in time (optional)'), { target: { value: '2025-11-02T01:30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Record Submission' }));
  expect(await screen.findByText('Choose a valid, unambiguous School-local hand-in time.')).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});
it('does not copy a prior actual time into returned work; sends unknown with new recording', async () => {
  const patch = vi.spyOn(homeworkApi, 'resubmit').mockResolvedValue(submission);
  renderHomework(<SubmissionForm schoolId={schoolId} homeworkId={publishedHomework.id} studentId={studentId} submissionId={submissionId} initialContent="Revised" onCancel={() => {}} onSaved={() => {}} />);
  expect(screen.getByLabelText('Actual hand-in time (optional)')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Resubmit returned work' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith(submissionId, 'Revised', null));
});
it('shows only authorized download links in read-only attachment presentation, never upload or removal', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [{ id: 'file-association', name: 'work.pdf', byteSize: 32, submissionRecordedAt: submission.submittedAt }] }));
  renderHomework(<SubmissionAttachments submissionId={submissionId} />, 'PARENT');
  expect(await screen.findByRole('link', { name: 'work.pdf' })).toHaveAttribute('href', `/api/v1/homework-submissions/${submissionId}/attachments/file-association/download`);
  expect(screen.queryByLabelText('Add a private submission attachment')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /remove|upload/i })).not.toBeInTheDocument();
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});
it('retains a selected upload request ID and displays controlled failure without raw provider errors', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST'
    ? Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'FILE_RECONCILIATION_REQUIRED', message: 'raw provider detail' } }, { status: 422 })
    : Response.json({ data: [] }));
  renderHomework(<SubmissionAttachments submissionId={submissionId} editable />);
  await screen.findByText('No delivered attachments.');
  await userEvent.upload(screen.getByLabelText('Add a private submission attachment'), new File(['%PDF-1.7'], 'work.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Upload attachment' }));
  expect(await screen.findByText(/Upload outcome needs operator reconciliation/)).toBeInTheDocument();
  expect(screen.queryByText('raw provider detail')).not.toBeInTheDocument();
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(new Headers(writes[0]![1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
});

it('retains unsaved submission content after a controlled failure without leaking provider details', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'CONFLICT', message: 'Private transport detail' } }, { status: 409 }));
  renderHomework(<SubmissionForm schoolId={schoolId} homeworkId={publishedHomework.id} studentId={studentId} onCancel={vi.fn()} onSaved={vi.fn()} />, 'TEACHER');
  const content = screen.getByRole('textbox'); await userEvent.type(content, 'Preserve this draft');
  expect(screen.getByText('Unsaved changes')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Record Submission' }));
  expect(await screen.findByRole('alert')).toBeVisible(); expect(content).toHaveValue('Preserve this draft');
  expect(screen.queryByText('Private transport detail')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
