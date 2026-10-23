import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { Modal } from '@/components/academic/ui';
import { renderGrades } from '../grades/test-helpers';

afterEach(() => { cleanup(); document.body.style.overflow = ''; });
it('locks page scrolling, contains focus and restores the trigger and original scroll style on dismissal', async () => {
  document.body.style.overflow = 'auto';
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open form</button><button>Background action</button><Modal open={open} title="Form" onClose={() => setOpen(false)}><input aria-label="Name" /><button>Save</button></Modal></>;
  }
  renderGrades(<Example />); await userEvent.click(screen.getByRole('button', { name: 'Open form' }));
  const dialog = screen.getByRole('dialog', { name: 'Form' });
  expect(document.body.style.overflow).toBe('hidden');
  screen.getByRole('button', { name: 'Background action' }).focus();
  expect(dialog).toContainElement(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}'); expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
  await userEvent.keyboard('{Tab}'); expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open form' })).toHaveFocus(); expect(document.body.style.overflow).toBe('auto');
});
it('keeps the scroll lock through nested dismissal and releases it when both dialogs unmount', async () => {
  function Example() {
    const [outer, setOuter] = useState(true), [inner, setInner] = useState(false);
    return <Modal open={outer} title="Outer" onClose={() => setOuter(false)}><button onClick={() => setInner(true)}>Confirm</button><Modal open={inner} title="Inner" onClose={() => setInner(false)}><button onClick={() => { setInner(false); setOuter(false); }}>Close both</button></Modal></Modal>;
  }
  renderGrades(<Example />); await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden'); expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); await userEvent.click(screen.getByRole('button', { name: 'Close both' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.body.style.overflow).toBe('');
});
it('does not reset input focus when the parent rerenders with a new close callback', async () => {
  function Example() { const [value, setValue] = useState(''); return <Modal open title="Editing" onClose={() => setValue('')}><input aria-label="Name" value={value} onChange={event => setValue(event.target.value)} /></Modal>; }
  renderGrades(<Example />); const input = screen.getByRole('textbox', { name: 'Name' }); await userEvent.type(input, 'School notice');
  expect(input).toHaveValue('School notice'); expect(input).toHaveFocus();
});
