import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function AttendancePage() {
  return <FeaturePlaceholder title={copy.attendance} permission="attendance.read" />;
}
