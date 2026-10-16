import { Suspense } from 'react';
import { HomeworkWorkspace } from '@/components/homework/homework-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default function HomeworkPage() {
  return <Suspense fallback={<RouteLoading messageKey="homework.loading" />}><HomeworkWorkspace /></Suspense>;
}
