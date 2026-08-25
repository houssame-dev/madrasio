import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function NotificationsPage() {
  return <FeaturePlaceholder title={copy.notifications} permission="notifications.read" />;
}
