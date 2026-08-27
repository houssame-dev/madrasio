import { Suspense } from 'react';
import { HomeworkWorkspace } from '@/components/homework/homework-workspace';
import { PageLoading } from '@/components/ui/states';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';

export default function HomeworkPage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><HomeworkWorkspace /></Suspense>;
}
