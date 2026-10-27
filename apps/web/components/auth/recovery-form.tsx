'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { apiRequest } from '@/lib/frontend/api-client';
import { useTranslations } from 'next-intl';
import { LoaderCircle, Mail } from 'lucide-react';

const schema = z.object({ email: z.string().trim().email().max(254) });
export function RecoveryForm({
  presentation = 'default',
}: {
  presentation?: 'default' | 'showcase';
}) {
  const t = useTranslations('recovery');
  const visual = useTranslations('recoveryShowcase');
  const shared = useTranslations('authShowcase');
  const showcase = presentation === 'showcase';
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
  if (sent)
    return (
      <div className={showcase ? 'recovery-feedback' : undefined}>
        <InlineFeedback kind="success" brand={showcase}>
          {t('confirmation')}
        </InlineFeedback>
      </div>
    );
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
      <fieldset className={showcase ? 'auth-fields' : 'space-y-4'} disabled={!hydrated}>
        {error ? <InlineFeedback kind="error">{t('unavailable')}</InlineFeedback> : null}
        <Field
          required
          label={t('email')}
          htmlFor="recovery-email"
          error={
            form.formState.errors.email
              ? form.formState.errors.email.type === 'too_big'
                ? validation('emailTooLong', { maximum: 254 })
                : validation('emailInvalid')
              : undefined
          }
        >
          <div className={showcase ? 'auth-input-wrap' : undefined}>
            {showcase ? <Mail aria-hidden="true" /> : null}
            <input
              id="recovery-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              autoCapitalize="none"
              placeholder={showcase ? shared('emailPlaceholder') : undefined}
              className={showcase ? 'auth-input' : inputClassName}
              aria-required="true"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={form.formState.errors.email ? 'recovery-email-error' : undefined}
              {...form.register('email')}
            />
          </div>
        </Field>
        <Button
          className={showcase ? 'auth-submit' : undefined}
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {showcase && form.formState.isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {form.formState.isSubmitting ? t('pending') : showcase ? visual('submit') : t('submit')}
        </Button>
        {showcase && form.formState.isSubmitting ? (
          <span className="sr-only" role="status">
            {t('pending')}
          </span>
        ) : null}
      </fieldset>
    </form>
  );
}
