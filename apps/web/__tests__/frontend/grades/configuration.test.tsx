import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  GradingConfigurationWorkspace,
  GradingRulesForm,
} from '@/components/grades/configuration-workspace';
import { configurationApi } from '@/lib/frontend/grades/configuration';
import { ApiClientError } from '@/lib/frontend/api-client';
import { DEFAULT_RULES } from '../../grades/test-helpers';
const state = vi.hoisted(() => ({ role: 'SCHOOL_ADMIN' as string | null }));
vi.mock('@/components/app/app-context', () => ({
  useAppContext: () => ({
    user: { id: 'admin' },
    currentSchool: state.role ? { id: 'school', role: state.role } : null,
    platformAuthority: 'SUPER_ADMIN',
  }),
}));
vi.mock('@/lib/frontend/grades/configuration', async (original) => ({
  ...(await original<object>()),
  configurationApi: {
    list: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    status: vi.fn(),
    version: vi.fn(),
    rules: vi.fn(),
    transition: vi.fn(),
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.role = 'SCHOOL_ADMIN';
  vi.mocked(configurationApi.list).mockResolvedValue({
    data: [{ id: 'config', name: 'Standard', status: 'ACTIVE' }],
    meta: { total: 1 },
  });
  vi.mocked(configurationApi.detail).mockResolvedValue({
    id: 'config',
    name: 'Standard',
    status: 'ACTIVE',
    versions: [
      {
        id: 'old',
        versionNumber: 1,
        status: 'ARCHIVED',
        editable: false,
        hasHistory: true,
        rules: DEFAULT_RULES,
      },
      {
        id: 'draft',
        versionNumber: 2,
        status: 'DRAFT',
        editable: true,
        hasHistory: false,
        rules: DEFAULT_RULES,
      },
    ],
  });
});
function wrap(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
it.each(['TEACHER', 'PARENT', null])(
  'hides configuration actions for %s even with a platform flag',
  (role) => {
    state.role = role;
    wrap(<GradingConfigurationWorkspace />);
    expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument();
    expect(configurationApi.list).not.toHaveBeenCalled();
  },
);
it('shows current versions, stored rules and history explanation without destructive rule editing', async () => {
  wrap(<GradingConfigurationWorkspace />);
  await userEvent.click(await screen.findByRole('button', { name: 'Standard — ACTIVE' }));
  expect(await screen.findByText(/Bound academic records exist/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit draft v1' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Edit draft v2' }));
  expect(screen.getByLabelText('Result maximum score')).toHaveValue(20);
  expect(screen.getByLabelText('Period calculation')).toHaveValue('SIMPLE_AVERAGE');
});
it('validates name and numeric rules with associated errors and keyboard submission', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  wrap(<GradingRulesForm creating save={save} onCancel={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(screen.getByLabelText('Configuration name')).toHaveFocus();
  expect(screen.getByLabelText('Configuration name')).toHaveAttribute('aria-invalid', 'true');
  await userEvent.type(screen.getByLabelText('Configuration name'), 'New rules');
  await userEvent.clear(screen.getByLabelText('Result maximum score'));
  await userEvent.type(screen.getByLabelText('Result maximum score'), '0');
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check numeric ranges');
  expect(screen.getByLabelText('Result maximum score')).toHaveFocus();
  expect(screen.getByLabelText('Result maximum score')).toHaveAttribute('aria-invalid', 'true');
  expect(save).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('Result maximum score'));
  await userEvent.type(screen.getByLabelText('Result maximum score'), '20{Enter}');
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
});
it('prevents duplicate submissions while pending and keeps sanitized failure visible', async () => {
  let reject!: (reason: Error) => void;
  const save = vi.fn(
    () =>
      new Promise<void>((_resolve, failure) => {
        reject = failure;
      }),
  );
  wrap(<GradingRulesForm save={save} onCancel={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(save).toHaveBeenCalledOnce();
  await act(async () =>
    reject(
      new ApiClientError(409, {
        code: 'CONFLICT',
        featureCode: 'GRADING_CONFIGURATION_LOCKED',
        message: 'raw provider detail',
      }),
    ),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('locked to preserve academic history');
  expect(screen.queryByText('raw provider detail')).not.toBeInTheDocument();
});
it('creates a configuration and displays success feedback', async () => {
  vi.mocked(configurationApi.create).mockResolvedValue({});
  wrap(<GradingConfigurationWorkspace />);
  await userEvent.click(await screen.findByRole('button', { name: 'Create configuration' }));
  await userEvent.type(screen.getByLabelText('Configuration name'), 'New');
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Existing academic records were not recalculated',
  );
  expect(configurationApi.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'New', rules: expect.objectContaining({ schemaVersion: 1 }) }),
  );
});
it('saves supported type weighting without inventing weights for blank types', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  wrap(<GradingRulesForm save={save} onCancel={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText('Assessment weighting'), 'WEIGHTED');
  await userEvent.type(screen.getByLabelText('EXAM weight'), '50');
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].rules.assessmentWeighting).toEqual({
    mode: 'WEIGHTED',
    weightsByType: { EXAM: 50 },
  });
});
