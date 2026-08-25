import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function HomeworkPage() {
  return <FeaturePlaceholder title={copy.homework} permission="homework.read" />;
}
