// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';

afterEach(() => vi.unstubAllGlobals());
it.each(['/login', '/dashboard'] as const)('requests a replacement document for the fixed post-Auth destination %s', (destination) => {
  const replace = vi.fn();
  vi.stubGlobal('window', { location: { replace } });
  navigateAfterAuth(destination);
  expect(replace).toHaveBeenCalledOnce(); expect(replace).toHaveBeenCalledWith(destination);
});
it('does not pretend a failed document navigation succeeded', () => {
  vi.stubGlobal('window', { location: { replace: () => { throw new Error('Synthetic navigation failure'); } } });
  expect(() => navigateAfterAuth('/login')).toThrow('Synthetic navigation failure');
});
