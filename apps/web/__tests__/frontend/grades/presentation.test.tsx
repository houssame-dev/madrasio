import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Modal } from '@/components/academic/ui';
import { renderGrades } from './test-helpers';

afterEach(cleanup);
it('gives nested confirmations distinct names and dismisses only the top dialog with Escape', async () => {
  const closeResult = vi.fn();
  function Example() {
    const [confirming, setConfirming] = useState(false);
    return <Modal open title="Working result" onClose={closeResult}><button onClick={() => setConfirming(true)}>Publish</button><Modal open={confirming} title="Confirm publication" onClose={() => setConfirming(false)}><button>Confirm</button></Modal></Modal>;
  }
  const user = userEvent.setup(), view = renderGrades(<Example />);
  await user.click(screen.getByRole('button', { name: 'Publish' }));
  const result = screen.getByRole('dialog', { name: 'Working result' }), confirmation = screen.getByRole('dialog', { name: 'Confirm publication' });
  expect(result.getAttribute('aria-labelledby')).not.toBe(confirmation.getAttribute('aria-labelledby'));
  await user.keyboard('{Shift>}{Tab}{/Shift}'); expect(within(confirmation).getByRole('button', { name: 'Confirm' })).toHaveFocus();
  await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog', { name: 'Confirm publication' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Working result' })).toBeVisible(); expect(closeResult).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Publish' })).toHaveFocus();
  view.unmount(); view.queryClient.clear();
});
