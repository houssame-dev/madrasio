import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function TeachersPage() {
  return <FeaturePlaceholder title={copy.teachers} permission="teachers.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN']} />;
}
