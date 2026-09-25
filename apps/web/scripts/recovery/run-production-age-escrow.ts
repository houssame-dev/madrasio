import {
  safeRecoveryError,
} from './contracts';
import {
  createProductionAgeEscrow,
  verifyProductionAgeEscrowRecovery,
} from './production-age-escrow';

async function main(): Promise<void> {
  const action =
    process.argv[2];

  if (action === 'create') {
    const result =
      await createProductionAgeEscrow();

    process.stdout.write(
      `${JSON.stringify({
        event:
          'production_age_escrow_created',
        ageVersion:
          result.ageVersion,
        escrowSha256:
          result.escrowSha256,
        primaryRecipientMatch:
          result.primaryRecipientMatch,
      })}\n`,
    );

    return;
  }

  if (action === 'verify') {
    const result =
      await verifyProductionAgeEscrowRecovery();

    process.stdout.write(
      `${JSON.stringify({
        event:
          'production_age_escrow_recovery_verified',
        ageVersion:
          result.ageVersion,
        escrowSha256:
          result.escrowSha256,
        probeSha256:
          result.probeSha256,
        recoveryProof:
          result.recoveryProof,
        offDeviceRetrieved:
          result.offDeviceRetrieved,
      })}\n`,
    );

    return;
  }

  throw new Error(
    'Production age escrow action must be create or verify.',
  );
}

main().catch(
  (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify(
        safeRecoveryError(
          error,
        ),
      )}\n`,
    );

    process.exitCode = 1;
  },
);