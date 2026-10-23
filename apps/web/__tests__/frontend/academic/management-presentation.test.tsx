import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { Field, ManagementGuide, Modal, Pagination, TableShell, inputClassName } from '@/components/academic/ui';
import { getCatalog } from '@/i18n/catalogs';
import { RelationshipForm } from '@/components/parents/relationship-form';
import { page, parentId, renderParents, schoolId, student, studentId } from '../parents/test-helpers';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each<SupportedLocale>(['en', 'fr', 'ar'])('preserves row identity, actions and pagination in responsive management tables in %s', async locale => {
  const messages = getCatalog(locale), edit = vi.fn(), paginate = vi.fn(), user = userEvent.setup();
  render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <ManagementGuide area="students" />
    <TableShell responsive headers={['Student', 'Actions']}><tr><td>Amina</td><td><button onClick={edit}>Review Amina</button></td></tr></TableShell>
    <Pagination page={1} pageSize={20} total={21} onPage={paginate} />
  </div></NextIntlClientProvider>);
  expect(screen.getByText(messages.managementUi.students)).toBeVisible();
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
  expect(within(table).getAllByRole('cell')).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Review Amina' })).toHaveLength(1);
  await user.tab(); await user.keyboard('{Enter}'); expect(edit).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: messages.collection.next })); expect(paginate).toHaveBeenCalledWith(2);
});
it('announces loading without presenting skeleton values as records', () => {
  render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><TableShell responsive loading headers={['Name']}><tr><td>Not loaded</td></tr></TableShell></NextIntlClientProvider>);
  expect(screen.getByRole('status')).toHaveTextContent(getCatalog('en').academic.loading);
  expect(screen.queryByText('Not loaded')).not.toBeInTheDocument();
});
it('retains modal focus trapping, Escape dismissal and trigger focus restoration', async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Edit profile</button><Modal open={open} title="Profile" onClose={() => setOpen(false)}><Field label="Name" htmlFor="name" error="Required"><input id="name" className={inputClassName} /></Field><button>Save</button></Modal></>;
  }
  const user = userEvent.setup();
  render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><Example /></NextIntlClientProvider>);
  await user.click(screen.getByRole('button', { name: 'Edit profile' }));
  const dialog = screen.getByRole('dialog', { name: 'Profile' });
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.keyboard('{Shift>}{Tab}{/Shift}'); expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Required');
  await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
});
it('shows the full selected child identity separately from a potentially clipped native option', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([{ ...student, lastName: 'Synthetic long family name' }], 1, 10)));
  const user = userEvent.setup();
  const view = renderParents(<RelationshipForm schoolId={schoolId} parentId={parentId} activeRelationships={[]} onCancel={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole('option', { name: /Synthetic long family name/ });
  await user.selectOptions(screen.getByLabelText('Student'), studentId);
  const summary = screen.getByRole('region', { name: 'Student' });
  expect(within(summary).getByText('Nora Synthetic long family name')).toBeVisible();
  expect(summary).toHaveTextContent('S-01');
  view.unmount(); view.queryClient.clear();
});
