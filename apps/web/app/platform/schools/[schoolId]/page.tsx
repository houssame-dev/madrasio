import { PlatformSchool } from '@/components/platform/workspace';
export default async function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  return <PlatformSchool schoolId={(await params).schoolId} />;
}
