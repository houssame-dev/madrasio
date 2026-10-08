export const recoveryCopy = {
  title: 'Recover account access',
  description: 'Enter your account email to request a password recovery link.',
  email: 'Email address',
  submit: 'Send recovery link',
  pending: 'Requesting recovery…',
  confirmation:
    'If this address is eligible, check your inbox and spam folder for a recovery email. If it does not arrive, wait before trying again or contact your School administrator.',
  unavailable: 'The request could not be completed. Wait before trying again.',
  assist: 'Send account recovery',
  assistDescription:
    'Send a recovery link to the linked account, including an unaccepted invitation. You cannot see or choose their password.',
  assistSuccess:
    'Recovery requested. Ask the account owner to check their email. Delivery is not guaranteed.',
  assistFailure:
    'Recovery could not be initiated. Check account eligibility with your operator before retrying.',
  cooldown:
    'A recovery request was recently recorded. Wait at least one minute before requesting another.',
  back: 'Return to sign in',
  invalid:
    'This link is invalid or has expired. Request a new recovery link or contact your School administrator.',
  passwordIntro: 'Choose a password to finish setting up or recovering your account.',
  passwordFailure:
    'Your password could not be set. Request a new recovery link or contact your School administrator.',
} as const;
