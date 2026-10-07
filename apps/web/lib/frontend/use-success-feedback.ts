'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Action acknowledgement only. Never use for persistent business state/errors. */
export function useSuccessFeedback() {
  const [message, setMessage] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((next?: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    if (next) timer.current = setTimeout(() => setMessage(undefined), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, show] as const;
}
