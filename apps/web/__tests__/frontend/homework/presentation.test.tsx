import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, it, expect, vi } from 'vitest';
import { HomeworkLifecycleActions } from '@/components/homework/homework-lifecycle-actions';
import { SubmissionAttachments } from '@/components/homework/submission-attachments';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { renderHomework, schoolId, homeworkId, submissionId } from './test-helpers';
afterEach(() => vi.restoreAllMocks());
it('blocks targetless publication while repeating the exact assignment context', async () => {
  vi.spyOn(homeworkApi, 'targets').mockResolvedValue([]);
  const patch = vi.spyOn(homeworkApi, 'patch');
  renderHomework(
    <HomeworkLifecycleActions
      schoolId={schoolId}
      homeworkId={homeworkId}
      status="DRAFT"
      context={<p>Exact assignment · Year 2026/2027 · Class 6A</p>}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/Exact assignment/)).toBeVisible();
  await within(dialog).findByText('No Classes are targeted yet.');
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  expect(patch).not.toHaveBeenCalled();
});
it.each(['uncertain', 'not-ready'])(
  'does not permit another intent or false success after %s upload outcome',
  async (mode) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) =>
        init?.method === 'POST'
          ? mode === 'uncertain'
            ? Response.json(
                {
                  error: {
                    code: 'BUSINESS_RULE_VIOLATION',
                    featureCode: 'FILE_RECONCILIATION_REQUIRED',
                  },
                },
                { status: 422 },
              )
            : Response.json({ data: { id: 'intent', state: 'UPLOADING' } })
          : Response.json({ data: [] }),
      );
    renderHomework(<SubmissionAttachments submissionId={submissionId} editable />);
    await screen.findByText('No delivered attachments.');
    const input = screen.getByLabelText('Add a private submission attachment');
    await userEvent.upload(input, new File(['%PDF-1.7'], 'safe.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload attachment' }));
    await screen.findByText(/Upload outcome needs operator reconciliation/);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload attachment' })).toBeDisabled(),
    );
    expect(input).toBeDisabled();
    expect(screen.queryByText(/Attachment added/)).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  },
);
