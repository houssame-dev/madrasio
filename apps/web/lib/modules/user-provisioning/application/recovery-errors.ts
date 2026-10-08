import { AppError } from '@/lib/errors';

export class AccountRecoveryError extends AppError {
  constructor(
    readonly featureCode:
      | 'ACCOUNT_RECOVERY_INELIGIBLE'
      | 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED'
      | 'ACCOUNT_RECOVERY_DELIVERY_UNCERTAIN'
      | 'ACCOUNT_RECOVERY_COOLDOWN',
  ) {
    super(
      featureCode === 'ACCOUNT_RECOVERY_COOLDOWN' ? 'RATE_LIMITED' : 'CONFLICT',
      'Account recovery could not be initiated. Contact your administrator or try later.',
    );
  }
}
