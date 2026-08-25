import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function ParentsPage() {
  return <FeaturePlaceholder title={copy.parents} permission="parents.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN']} />;
}
