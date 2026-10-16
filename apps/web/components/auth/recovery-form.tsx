'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { apiRequest } from '@/lib/frontend/api-client';
import { useTranslations } from 'next-intl';

const schema = z.object({ email: z.string().trim().email().max(254) });
export function RecoveryForm() {
  const t = useTranslations('recovery');
  const validation = useTranslations('validation');
  const [hydrated, setHydrated] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });
  useEffect(() => setHydrated(true), []);
  if (sent) return <InlineFeedback kind="success">{t('confirmation')}</InlineFeedback>;
  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        if (submitting.current) return;
        submitting.current = true;
        setError(false);
        try {
          await apiRequest('/api/v1/auth/recovery', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          setSent(true);
        } catch {
          setError(true);
          form.setFocus('email');
        } finally {
          submitting.current = false;
        }
      })}
    >
      <fieldset className="space-y-4" disabled={!hydrated}>
        {error ? <InlineFeedback kind="error">{t('unavailable')}</InlineFeedback> : null}
        <Field
          required
          label={t('email')}
          htmlFor="recovery-email"
          error={form.formState.errors.email ? (form.formState.errors.email.type === 'too_big' ? validation('emailTooLong', { maximum: 254 }) : validation('emailInvalid')) : undefined}
        >
          <input
            id="recovery-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            className={inputClassName}
            {...form.register('email')}
          />
        </Field>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('pending') : t('submit')}
        </Button>
      </fieldset>
    </form>
  );
}
