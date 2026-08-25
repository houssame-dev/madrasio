import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassesSection } from '@/components/academic/classes-section';
import { CurriculaSection } from '@/components/academic/curricula-section';
import { StructureSection } from '@/components/academic/structure-section';
import { TracksSection } from '@/components/academic/tracks-section';
import { curriculumId, levelId, page, renderAcademic, stageId, subjectId, timestamps, trackId, versionId, yearId } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

const stage = { id: stageId, name: 'Primary', sequence: 1, status: 'ACTIVE' as const, ...timestamps };
const level = { id: levelId, stageId, name: 'Level 1', sequence: 1, status: 'ACTIVE' as const, ...timestamps };
const track = { id: trackId, name: 'Sciences', sequence: 1, status: 'ACTIVE' as const, ...timestamps };
const curriculum = { id: curriculumId, name: 'National', status: 'ACTIVE' as const, ...timestamps };
const version = { id: versionId, curriculumId, name: 'V1', status: 'DRAFT' as const, ...timestamps };
const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'PLANNED' as const, ...timestamps };

describe('Stage, Level and Track panels', () => {
  it('renders Levels with their authoritative Stage relationship', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/v1/levels')) return Response.json(page([level]));
      return Response.json(page([stage]));
    });
    renderAcademic(<StructureSection schoolId="school" canManage page={1} onPage={vi.fn()} />);
    expect((await screen.findAllByText('Primary')).length).toBeGreaterThan(0);
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create level' })).toBeInTheDocument();
  });

  it('renders Track as an independent School-level structure with no parent selector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([track])));
    renderAcademic(<TracksSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByText('Sciences')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create track' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Level')).not.toBeInTheDocument();
  });

  it('offers retry for a transient list error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('gateway', { status: 502 })).mockResolvedValueOnce(Response.json(page([track])));
    renderAcademic(<TracksSection schoolId="school" canManage={false} page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Academic structure could not be loaded.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sciences')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Curricula and Classes panels', () => {
  it('drills from Curriculum to named Version and coefficient-bearing CurriculumSubject', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(`/api/v1/curricula/${curriculumId}/versions`)) return Response.json(page([version]));
      if (url.startsWith(`/api/v1/curriculum-versions/${versionId}/subjects`)) return Response.json(page([{ id: 'cs', curriculumVersionId: versionId, subjectId, subjectName: 'Mathematics', subjectCode: 'MAT', coefficient: '7.00', displayOrder: 1, status: 'ACTIVE', ...timestamps }]));
      if (url.startsWith('/api/v1/subjects')) return Response.json(page([{ id: subjectId, name: 'Mathematics', code: 'MAT', status: 'ACTIVE', ...timestamps }]));
      return Response.json(page([curriculum]));
    });
    renderAcademic(<CurriculaSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByText('National')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Curriculum versions/ }));
    expect(await screen.findByText('V1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Version subjects' }));
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('7.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach subject' })).toBeDisabled();
  });

  it('renders Class relationship labels and requests an AcademicYear backend filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/v1/classes')) return Response.json(page([{ id: 'class', name: 'Class A', academicYearId: yearId, stageId, levelId, trackId, curriculumVersionId: versionId, status: 'ACTIVE', ...timestamps }]));
      if (url.startsWith('/api/v1/academic-years')) return Response.json(page([year]));
      if (url.startsWith('/api/v1/stages')) return Response.json(page([stage]));
      if (url.startsWith('/api/v1/levels')) return Response.json(page([level]));
      if (url.startsWith('/api/v1/tracks')) return Response.json(page([track]));
      if (url.startsWith(`/api/v1/curricula/${curriculumId}/versions`)) return Response.json(page([version]));
      if (url.startsWith('/api/v1/curricula')) return Response.json(page([curriculum]));
      throw new Error(`Unexpected request ${url}`);
    });
    renderAcademic(<ClassesSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByText('Class A')).toBeInTheDocument();
    expect(screen.getAllByText('2026/2027').length).toBeGreaterThan(0);
    expect(screen.getByText('National — V1')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Academic year'), yearId);
    await screen.findByText('Class A');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`academicYearId=${yearId}`))).toBe(true);
  });
});
