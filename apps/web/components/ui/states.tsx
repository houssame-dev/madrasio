import { AlertCircle, Building2, Inbox, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@school/ui';
import { useTranslations } from 'next-intl';

interface StateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

function StatePanel({ icon, title, description, action, headingLevel = 1 }: StateProps & { icon: ReactNode; headingLevel?: 1 | 2 }) {
  const heading = headingLevel === 1
    ? <h1 className="text-xl font-semibold">{title}</h1>
    : <h2 className="text-xl font-semibold">{title}</h2>;
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
      <span className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden="true">{icon}</span>
      <div className="space-y-1">
        {heading}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </section>
  );
}

export function PageLoading({ label }: { label?: string }) {
  const t = useTranslations('states');
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <LoaderCircle className="me-3 size-5 animate-spin" aria-hidden="true" />
      <span>{label === undefined ? t('loading') : label}</span>
    </div>
  );
}

export function InlineLoading({ label }: { label?: string }) {
  const t = useTranslations('states');
  return <span className="inline-flex items-center text-sm text-muted-foreground" role="status"><LoaderCircle className="me-2 size-4 animate-spin" aria-hidden="true" />{label === undefined ? t('loading') : label}</span>;
}

export function EmptyState({ title, description, action }: StateProps) {
  return <StatePanel icon={<Inbox className="size-6" />} title={title} description={description} action={action} headingLevel={2} />;
}

export function ApiErrorState({ title, description, onRetry }: Partial<StateProps> & { onRetry?: () => void }) {
  const t = useTranslations('states');
  return <StatePanel icon={<AlertCircle className="size-6" />} title={title === undefined ? t('error.title') : title} description={description === undefined ? t('error.description') : description} action={onRetry ? <Button type="button" variant="outline" onClick={onRetry}>{t('error.retry')}</Button> : undefined} headingLevel={2} />;
}

export function AccessDeniedState({ title, description, action }: Partial<StateProps>) {
  const t = useTranslations('states');
  return <StatePanel icon={<LockKeyhole className="size-6" />} title={title === undefined ? t('accessDenied.title') : title} description={description === undefined ? t('accessDenied.description') : description} action={action} />;
}

export function NoSchoolState({ action }: { action?: ReactNode }) {
  const t = useTranslations('states');
  return <StatePanel icon={<Building2 className="size-6" />} title={t('noSchool.title')} description={t('noSchool.description')} action={action} />;
}
