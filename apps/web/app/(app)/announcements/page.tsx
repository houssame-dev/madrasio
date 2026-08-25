import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function AnnouncementsPage() {
  return <FeaturePlaceholder title={copy.announcements} permission="announcements.read" />;
}
