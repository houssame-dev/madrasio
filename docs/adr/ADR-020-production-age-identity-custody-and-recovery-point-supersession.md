# ADR-020: Production Age Identity Custody and Recovery-Point Supersession

- Status: Accepted
- Date: 2026-09-24
- Amended: 2026-09-25

## Context

Task 050 accepted one real encrypted Production recovery point, but the matching
private age identity is not currently available on the reviewed recovery
workstation. The historical ciphertext remains valid evidence of successful
backup creation, encryption, upload, remote verification, independent readback,
monitoring, and cleanup, but it is not currently decryptable from this
workstation.

A newly generated age identity cannot decrypt ciphertext encrypted to the
historical recipient. Replacing the Production recipient therefore cannot make
the historical recovery point decryptable and must not rewrite, relabel,
re-encrypt, or reinterpret that ciphertext.

The original custody decision required two plaintext private-identity copies in
independently stored filesystem locations. A read-only operator storage audit
found only one eligible local filesystem volume. Requiring purchase of a second
physical device is not necessary to achieve the actual recovery objective.

Reviewed age tooling supports passphrase-protected identity files. This enables
the secondary recovery copy to be stored as encrypted ciphertext in a failure
domain independent from the operator workstation without placing plaintext
Production private-key material in that external storage.

The Production custody contract is therefore amended from two plaintext copies
to one plaintext primary identity plus one passphrase-encrypted off-device escrow
copy of that same identity.

## Decision

The historical accepted Production recovery point remains immutable historical
evidence and retains restore readiness `BLOCKED` while its matching historical
identity is unavailable.

Any replacement Production age identity must satisfy the following custody
contract before its public recipient may be accepted.

### Primary identity

- use reviewed age 1.3.1 tooling;
- generate the identity on an operator-controlled workstation outside the
  repository;
- retain one plaintext primary identity as a regular file outside the repository;
- never place the plaintext identity in the repository, CI, Vercel, GitHub
  secrets, R2/object storage, application configuration, logs, chat, or the
  off-device escrow provider;
- derive its public recipient with reviewed `age-keygen -y`;
- require that recipient to match the explicit expected Production recipient.

### Secondary encrypted escrow

- create a passphrase-encrypted age file containing the exact primary identity;
- use reviewed age 1.3.1 tooling and its interactive terminal passphrase flow;
- never provide the escrow passphrase through command-line arguments,
  environment variables, repository configuration, CI, provider configuration,
  logs, or chat;
- keep the escrow passphrase in a custody channel separate from the encrypted
  escrow artifact;
- permit the encrypted escrow artifact, but never the plaintext identity, to be
  stored in an independently controlled off-device storage provider;
- bind accepted escrow evidence to the exact encrypted artifact SHA-256;
- require a successful operator-interactive recovery proof before Production
  custody is accepted.

### Escrow recovery proof

The repository-owned custody process must prove that the encrypted escrow can
recover the same effective identity as the primary copy without persisting a
second long-lived plaintext identity.

The proof must:

1. use the encrypted escrow as a passphrase-protected age identity through the
   reviewed interactive terminal flow;
2. perform a non-secret cryptographic probe using that recovered identity;
3. prove that the primary identity can satisfy the corresponding recovery path;
4. require exact probe-content reconciliation;
5. bind the resulting non-secret verification evidence to:
   - the escrow ciphertext SHA-256;
   - the expected Production public recipient;
   - age runtime version 1.3.1;
6. expose no passphrase or private identity contents in output or diagnostics.

The non-interactive repository custody gate may consume only non-secret,
artifact-bound verification evidence produced by that interactive proof.

The gate must fail closed on missing primary identity, repository-contained
primary identity, missing escrow artifact, invalid escrow verification evidence,
escrow SHA mismatch, expected-recipient mismatch, incorrect age version,
unavailable tooling, or stale/mismatched verification evidence.

### Off-device requirement

The secondary encrypted escrow must exist outside the workstation failure domain
before the replacement Production recovery point is authorized.

A local copy of the encrypted escrow may be used temporarily for creation or
verification, but that local copy alone does not satisfy secondary custody.

Acceptance requires the independently stored escrow artifact to be retrievable
and byte/hash-equivalent to the verified encrypted artifact.

### Replacement recovery point

A replacement Production recovery point may be created only after:

1. the amended repository-owned custody implementation is accepted;
2. the primary plaintext identity is established;
3. the passphrase-encrypted escrow is created;
4. the escrow passphrase is held separately;
5. the encrypted escrow is stored off-device;
6. the off-device artifact is retrieved and its SHA-256 matches the verified
   escrow artifact;
7. the interactive escrow recovery proof succeeds;
8. the non-interactive custody gate accepts the artifact-bound proof;
9. only the public Production recipient is deliberately updated;
10. recurring Production backup automation remains disabled;
11. a separately authorized manual Production backup is approved;
12. the replacement ciphertext passes immutable upload and independent readback
    verification;
13. the replacement point completes a timed Production-to-isolated-local restore
    with the existing reconciliation, Auth, migration, relationship, security,
    and cleanup contracts.

The historical and replacement recovery points remain separately identifiable.
A replacement point does not supersede history by deletion; it supersedes the
historical point only for future recovery readiness.

## Alternatives rejected

- generating a new identity and treating it as able to decrypt the historical
  ciphertext;
- rewriting or re-encrypting the historical accepted ciphertext in place;
- retaining only one recoverable copy of the replacement Production identity;
- placing the plaintext Production identity in cloud/object storage;
- requiring purchase of a USB flash drive, external SSD, or other dedicated
  physical device when independently controlled encrypted off-device escrow can
  satisfy the recovery failure-domain requirement;
- keeping two plaintext copies on the same physical workstation or disk;
- placing the escrow passphrase beside the escrow ciphertext;
- passing the escrow passphrase through command arguments, environment
  variables, CI, provider configuration, logs, or chat;
- treating successful escrow encryption alone as proof that the escrow is
  recoverable;
- accepting an off-device object without hash-equivalent retrieval verification;
- silently changing `BACKUP_AGE_RECIPIENT`;
- automatically dispatching a replacement Production backup;
- enabling recurring Production backup automation before recovery acceptance;
- treating successful backup creation alone as proof of Production restore
  readiness.

## Consequences

The historical accepted Production recovery point remains preserved but blocked
for restore while its matching historical identity is unavailable.

The replacement design no longer requires purchase of a second physical storage
device.

Secondary custody now depends on both:

- availability of the encrypted off-device escrow artifact; and
- availability of its separately held passphrase.

Loss of either reopens the Production custody gate.

The encrypted escrow provider is permitted to hold ciphertext only. Possession
of that ciphertext alone must not provide the plaintext Production identity.

Passphrase operations are deliberately operator-interactive rather than
headless. The Production passphrase is not an application, CI, or provider
secret.

The repository may automate non-secret structural, hash, recipient, version, and
receipt validation, while the passphrase-protected recovery proof remains an
explicit operator ceremony.

A real replacement identity, escrow artifact, passphrase, off-device upload,
Production recipient change, replacement backup, and timed restore remain
separate later operator actions and are not authorized by this amendment alone.

Production customer onboarding remains blocked until a decryptable replacement
Production recovery point completes the timed isolated-local restore and the
remaining Production recovery gates are accepted.