import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function AcademicPage() {
  return <FeaturePlaceholder title={copy.academic} permission="academic_structure.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN']} />;
}
