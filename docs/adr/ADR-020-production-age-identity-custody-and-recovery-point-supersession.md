# ADR-020: Production Age Identity Custody and Recovery-Point Supersession

- Status: Accepted
- Date: 2026-09-24

## Context

Task 050 accepted one real encrypted Production recovery point, but the matching
private age identity is not currently available on the reviewed recovery
workstation. The historical ciphertext remains valid evidence of successful
backup creation, encryption, upload, remote verification, independent readback,
monitoring, and cleanup, but it is not currently decryptable from this
workstation.

A newly generated age identity cannot decrypt ciphertext encrypted to the
historical recipient. Replacing the Production recipient therefore cannot make
the historical recovery point decryptable and must not rewrite, relabel, or
reinterpret that ciphertext.

Production recovery needs a durable private-key custody contract before another
recovery point can be accepted.

## Decision

The historical accepted Production recovery point remains immutable historical
evidence and retains restore readiness `BLOCKED` while its matching identity is
unavailable.

Any replacement Production age identity must satisfy all of the following before
its public recipient may be accepted:

- use reviewed age 1.3.1 tooling;
- be generated on an operator-controlled workstation outside the repository;
- never place private identity material in the repository, CI, Vercel, GitHub
  backup secrets, R2/object storage, application configuration, logs, or chat;
- maintain two operator-controlled private identity copies:
  - one primary recovery copy;
  - one independently stored secondary recovery copy;
- require both copies to be regular files outside the repository;
- derive the public recipient independently from each copy with `age-keygen -y`;
- require both derived recipients to be valid and identical;
- require both derived recipients to match the explicit expected Production
  public recipient;
- expose only the public recipient to Production backup configuration;
- record only non-secret readiness metadata.

The repository-owned custody gate must fail closed on missing files, relative
paths, repository-contained paths, duplicate canonical files, invalid
recipients, recipient mismatch, unavailable tooling, or incorrect age version.

A replacement Production recovery point may be created only after:

1. the repository-owned custody gate is accepted;
2. the two-copy custody contract is established;
3. only the public Production recipient is deliberately updated;
4. recurring Production backup automation remains disabled;
5. a separately authorized manual Production backup is approved;
6. the replacement ciphertext passes immutable upload and independent readback
   verification;
7. the replacement point completes a timed Production-to-isolated-local restore
   with the existing reconciliation, Auth, migration, relationship, security,
   and cleanup contracts.

The historical and replacement recovery points must remain separately
identifiable. A replacement point does not supersede history by deletion; it
supersedes the historical point only for future recovery readiness.

## Alternatives rejected

- generating a new age identity and treating it as able to decrypt the historical
  ciphertext;
- rewriting or re-encrypting the historical accepted ciphertext in place;
- storing the private Production identity in repository, CI, provider, object
  storage, application configuration, logs, or chat;
- retaining only one operator-controlled private identity copy;
- silently changing `BACKUP_AGE_RECIPIENT`;
- automatically dispatching a second Production backup;
- enabling recurring Production backup automation before recovery acceptance;
- treating successful backup creation alone as proof of Production restore
  readiness.

## Consequences

The historical accepted Production recovery point remains preserved but blocked
for restore while its matching identity is unavailable.

Replacement recovery readiness becomes intentionally fail-closed. A real
replacement identity, provider recipient change, replacement backup, and timed
restore are separate later operator actions and are not authorized by this ADR
alone.

The two-copy requirement improves operational recoverability but does not prove
that the two files are stored in independent physical failure domains. The
repository can verify distinct canonical files and recipient equivalence; the
operator remains responsible for independent storage custody.

Production customer onboarding remains blocked until a decryptable Production
recovery point completes the timed isolated-local restore and the remaining
Production recovery gates are accepted.