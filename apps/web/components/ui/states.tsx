import { AlertCircle, Building2, Inbox, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@school/ui';
import { copy } from '@/lib/frontend/copy';

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

export function PageLoading({ label = copy.loadingApplication }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <LoaderCircle className="me-3 size-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function InlineLoading({ label = copy.loadingApplication }: { label?: string }) {
  return <span className="inline-flex items-center text-sm text-muted-foreground" role="status"><LoaderCircle className="me-2 size-4 animate-spin" aria-hidden="true" />{label}</span>;
}

export function EmptyState({ title, description, action }: StateProps) {
  return <StatePanel icon={<Inbox className="size-6" />} title={title} description={description} action={action} headingLevel={2} />;
}

export function ApiErrorState({ title = copy.requestFailed, description = copy.requestFailedDescription, onRetry }: Partial<StateProps> & { onRetry?: () => void }) {
  return <StatePanel icon={<AlertCircle className="size-6" />} title={title} description={description} action={onRetry ? <Button type="button" variant="outline" onClick={onRetry}>{copy.tryAgain}</Button> : undefined} headingLevel={2} />;
}

export function AccessDeniedState({ title = copy.accessDenied, description = copy.accessDeniedDescription, action }: Partial<StateProps>) {
  return <StatePanel icon={<LockKeyhole className="size-6" />} title={title} description={description} action={action} />;
}

export function NoSchoolState({ action }: { action?: ReactNode }) {
  return <StatePanel icon={<Building2 className="size-6" />} title={copy.noSchool} description={copy.noSchoolDescription} action={action} />;
}
