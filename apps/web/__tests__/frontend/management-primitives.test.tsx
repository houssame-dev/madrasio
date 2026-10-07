import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field, InlineFeedback } from '@/components/academic/ui';
import { PageContainer, pageWidths } from '@/components/ui/page-container';
import { SearchInput } from '@/components/ui/search-input';
import { useSuccessFeedback } from '@/lib/frontend/use-success-feedback';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function Form() {
  const form = useForm<{ first: string; second: string }>();
  return <form noValidate onSubmit={form.handleSubmit(() => {})}>
    <Field label="First" htmlFor="first" required hint="Helper" error={form.formState.errors.first?.message}><input id="first" {...form.register('first', { required: 'First required' })} /></Field>
    <Field label="Second" htmlFor="second" required error={form.formState.errors.second?.message}><input id="second" {...form.register('second', { required: 'Second required' })} /></Field>
    <button>Save</button>
  </form>;
}

describe('accessible management fields', () => {
  it('preserves label, RHF ref/focus, required state and helper + multiple error descriptions', async () => {
    render(<Form />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const first = screen.getByRole('textbox', { name: 'First' });
    const second = screen.getByRole('textbox', { name: 'Second' });
    await waitFor(() => expect(first).toHaveFocus());
    expect(first).toHaveAttribute('aria-required', 'true');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAccessibleDescription('Helper First required');
    expect(second).toHaveAccessibleDescription('Second required');
    expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
    await userEvent.click(second);
    await userEvent.type(second, 'ok');
    expect(second).toHaveFocus(); // Validation while typing never refocuses the first field.
  });
  it('merges an existing description without losing native required or refs', () => {
    render(<><p id="extra">Extra</p><Field label="Name" htmlFor="name" hint="Help" error="Invalid"><input required id="name" aria-describedby="extra" /></Field></>);
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Extra Help Invalid');
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-required', 'true');
  });
});

function Feedback() {
  const [notice, show] = useSuccessFeedback();
  return <><button onClick={() => show('Saved')}>Save</button>{notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}<InlineFeedback kind="error">Action needed</InlineFeedback><InlineFeedback kind="warning">Warning remains</InlineFeedback></>;
}

describe('transient action success', () => {
  it('announces politely for four seconds, renews repeated success, and preserves errors/warnings/focus', () => {
    vi.useFakeTimers(); render(<Feedback />);
    const button = screen.getByRole('button'); button.focus(); fireEvent.click(button);
    expect(screen.getByText('Saved').closest('[role]')).toHaveAttribute('role', 'status');
    expect(button).toHaveFocus();
    act(() => vi.advanceTimersByTime(3000)); fireEvent.click(button);
    act(() => vi.advanceTimersByTime(3999)); expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1)); expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Action needed');
    expect(screen.getByText('Warning remains')).toBeInTheDocument();
  });
  it('cleans pending timeout on unmount', () => {
    vi.useFakeTimers(); const view = render(<Feedback />); fireEvent.click(screen.getByRole('button'));
    expect(vi.getTimerCount()).toBe(1); view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('shared search', () => {
  it('debounces raw typing at 350ms, trims once and clears immediately', () => {
    vi.useFakeTimers(); const onSearch = vi.fn();
    render(<SearchInput id="search" label="Search names" onSearch={onSearch} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'm' } }); act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: 'math ' } }); act(() => vi.advanceTimersByTime(349));
    expect(onSearch).not.toHaveBeenCalled(); act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1); expect(onSearch).toHaveBeenCalledWith('math');
  });
  it('clears URL state immediately and cancels a pending query', () => {
    vi.useFakeTimers(); const onSearch = vi.fn();
    render(<SearchInput id="search" label="Search names" value="old" onSearch={onSearch} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearch).toHaveBeenCalledTimes(1); expect(onSearch).toHaveBeenCalledWith(undefined);
    act(() => vi.advanceTimersByTime(500)); expect(onSearch).toHaveBeenCalledTimes(1);
  });
  it('restores external navigation state, cancels old draft, and cleans up on unmount', () => {
    vi.useFakeTimers(); const onSearch = vi.fn();
    const view = render(<SearchInput id="search" label="Search names" value="a" onSearch={onSearch} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pending' } });
    view.rerender(<SearchInput id="search" label="Search names" value="back" onSearch={onSearch} />);
    expect(screen.getByRole('searchbox')).toHaveValue('back'); act(() => vi.advanceTimersByTime(500)); expect(onSearch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pending again' } }); view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('supports keyboard submit and immediate complete-dataset filtering', async () => {
    const onSearch = vi.fn();
    function Local() { const [value, setValue] = useState(''); return <SearchInput id="local" label="Local names" mode="local" value={value} onSearch={(next) => { setValue(next ?? ''); onSearch(next); }} />; }
    render(<Local />);
    await userEvent.type(screen.getByRole('searchbox'), 'AB');
    expect(onSearch.mock.calls).toEqual([['A'], ['AB']]);
    await userEvent.keyboard('{Enter}'); expect(onSearch).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});

describe('semantic page containers', () => {
  it.each(Object.keys(pageWidths) as (keyof typeof pageWidths)[])('%s changes width without shell padding or hard minimum width', (variant) => {
    const { container } = render(<main className="p-[var(--app-page-padding)]"><PageContainer variant={variant}>Content</PageContainer></main>);
    const page = screen.getByText('Content');
    expect(page).toHaveClass(pageWidths[variant], 'w-full', 'min-w-0', 'mx-auto');
    expect(page.className).not.toMatch(/(?:^|\s)p[xy]?-/);
    expect(container.firstChild).toHaveClass('p-[var(--app-page-padding)]');
  });
});
