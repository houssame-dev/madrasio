import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SubjectsSection } from '@/components/academic/subjects-section';
import { ClassesSection } from '@/components/academic/classes-section';
import { CurriculaSection } from '@/components/academic/curricula-section';
import { AcademicWorkspace } from '@/components/academic/academic-workspace';
import { page, renderAcademic, timestamps, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ query: 'section=classes&page=7&status=ACTIVE', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.query), usePathname: () => '/academic', useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.replace.mockClear(); });

it.each(['classes', 'curricula'])('%s debounced search resets URL pagination and preserves status', async (section) => {
  navigation.query = `section=${section}&page=7&status=ACTIVE`;
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([])));
  renderAcademic(<AcademicWorkspace />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' new ' } });
  expect(navigation.replace).not.toHaveBeenCalled();
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(`/academic?section=${section}&page=1&status=ACTIVE&search=new`, { scroll: false }));
});

it('Classes combines name, Academic Year and status on the server and clears without dropping filters', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json(String(input).includes('/academic-years') ? page([{ id: yearId, name: '2026', ...timestamps }]) : page([])));
  function Harness() { const [search, setSearch] = useState<string | undefined>('Atlas'); return <ClassesSection schoolId="school" canManage={false} page={1} status="ACTIVE" search={search} onSearch={setSearch} onPage={vi.fn()} onStatus={vi.fn()} />; }
  renderAcademic(<Harness />);
  await screen.findByText('2026');
  fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: yearId } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/classes?page=1&pageSize=20&search=Atlas&status=ACTIVE&academicYearId=${yearId}`))).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/classes?page=1&pageSize=20&status=ACTIVE&academicYearId=${yearId}`))).toBe(true));
  expect(screen.queryByText(/class code/i)).not.toBeInTheDocument();
});

it('Curricula preserves archived status and clear restores the unsearched server list', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([])));
  function Harness() { const [search, setSearch] = useState<string | undefined>('National'); return <CurriculaSection schoolId="school" canManage={false} page={1} status="ARCHIVED" search={search} onSearch={setSearch} onPage={vi.fn()} onStatus={vi.fn()} />; }
  renderAcademic(<Harness />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(String(fetchMock.mock.calls[0][0])).toContain('search=National&status=ARCHIVED');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/curricula?page=1&pageSize=20&status=ARCHIVED'))).toBe(true));
});

it('Subjects settled query B remains visible when query A resolves late', async () => {
  let resolveA!: (value: Response) => void;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('search=A')) return new Promise<Response>((resolve) => { resolveA = resolve; });
    return Response.json(page([{ id: 'b', name: 'B result', status: 'ACTIVE', code: null, ...timestamps }]));
  });
  function Harness() { const [search, setSearch] = useState<string | undefined>('A'); return <SubjectsSection schoolId="school" canManage={false} page={1} search={search} onSearch={setSearch} onPage={vi.fn()} onStatus={vi.fn()} />; }
  renderAcademic(<Harness />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'B' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await screen.findByText('B result');
  await act(async () => resolveA(Response.json(page([{ id: 'a', name: 'A result', status: 'ACTIVE', code: null, ...timestamps }]))));
  expect(screen.getByText('B result')).toBeInTheDocument();
  expect(screen.queryByText('A result')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
