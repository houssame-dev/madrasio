import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@school/ui';

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    let clicked = 0;
    const user = userEvent.setup();
    render(<Button onClick={() => (clicked += 1)}>Click me</Button>);

    await user.click(screen.getByRole('button', { name: /click me/i }));
    expect(clicked).toBe(1);
  });
});
