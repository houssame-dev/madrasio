import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function GradesPage() {
  return <FeaturePlaceholder title={copy.grades} permission="grades.read" />;
}
