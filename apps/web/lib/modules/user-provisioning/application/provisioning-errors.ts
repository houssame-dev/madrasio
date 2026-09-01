import { AppError, type AppErrorCode } from '@/lib/errors';

export type ProvisioningFeatureCode =
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_NOT_ACTIVE'
  | 'PROFILE_ACCOUNT_ALREADY_LINKED'
  | 'ACCOUNT_ROLE_CONFLICT'
  | 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED'
  | 'ACCOUNT_INVITE_FAILED'
  | 'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED';

const category: Record<ProvisioningFeatureCode, AppErrorCode> = {
  PROFILE_NOT_FOUND: 'NOT_FOUND',
  PROFILE_NOT_ACTIVE: 'BUSINESS_RULE_VIOLATION',
  PROFILE_ACCOUNT_ALREADY_LINKED: 'CONFLICT',
  ACCOUNT_ROLE_CONFLICT: 'CONFLICT',
  ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED: 'CONFLICT',
  ACCOUNT_INVITE_FAILED: 'CONFLICT',
  ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED: 'INTERNAL_ERROR',
};

export class ProvisioningError extends AppError {
  readonly featureCode: ProvisioningFeatureCode;

  constructor(featureCode: ProvisioningFeatureCode, message: string, cause?: unknown) {
    super(category[featureCode], message, { cause });
    this.name = 'ProvisioningError';
    this.featureCode = featureCode;
  }
}

