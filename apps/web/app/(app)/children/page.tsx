import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function ChildrenPage() {
  return <FeaturePlaceholder title={copy.children} permission="students.read" roles={['PARENT']} />;
}
