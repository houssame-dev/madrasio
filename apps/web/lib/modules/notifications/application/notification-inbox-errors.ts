import { AppError } from '@/lib/errors';

export type NotificationInboxFeatureCode = 'NOTIFICATION_NOT_FOUND';

export class NotificationInboxError extends AppError {
  readonly featureCode: NotificationInboxFeatureCode;

  constructor(featureCode: NotificationInboxFeatureCode, message: string) {
    super('NOT_FOUND', message);
    this.name = 'NotificationInboxError';
    this.featureCode = featureCode;
  }
}
