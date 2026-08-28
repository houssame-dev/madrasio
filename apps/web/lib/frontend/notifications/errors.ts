import { ApiClientError } from '@/lib/frontend/api-client';

const featureMessages: Record<string, string> = {
  NOTIFICATION_NOT_FOUND: 'This notification is unavailable in your current school inbox.',
};

export function notificationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The notification request could not be completed. Please try again.';
  return featureMessages[error.featureCode ?? '']
    ?? (error.status < 500 ? error.message : 'The notification request could not be completed. Please try again.');
}
