# Credential exposure prevention

The Secret scan workflow uses checksum-pinned Gitleaks 8.30.1, a full-history
checkout, read-only GitHub permissions and complete redaction. It needs no provider
credentials, organization license, package installation or secret-bearing report
artifact. Configure it as a required check through a separately authorized
repository-settings change if desired; adding the workflow alone does not enforce
branch protection.

For a local history check with the same installed scanner:

```sh
gitleaks git . --config .gitleaks.toml --log-opts='--all --reflog --full-history -m' --redact=100 --no-banner --ignore-gitleaks-allow
```

History scanning does not cover ignored local files. Scan those locally with
`gitleaks dir` and full redaction, excluding installed dependencies and Git internals.
Include generated build outputs when checking for credential spills; bounded archive
inspection cannot decrypt encrypted backups. Do not upload local environment files or raw scanner reports to CI, issues,
chat or source control. Reports should contain rule, path, line and commit only.

The configuration extends the upstream detectors with database URI passwords,
Supabase server keys, sensitive environment assignments and private age identities.
Value exceptions require both a reviewed fixture path and an exact synthetic value.
Eleven additional historical false positives are pinned in `.gitleaksignore` by
original commit/path/rule/line: test sentinels/encoding cases, a documented loopback
validation URL and runtime URI interpolation. They do not exempt a changed value
in a future commit. There is no blanket exemption for tests or documentation. Supabase publishable
keys are public; server secrets and service-role JWTs are privileged. Legacy anon
JWTs require claim/context review rather than blanket JWT suppression.

Keep real configuration in ignored local files or the established secret store.
Environment templates must contain placeholders only. Private keys, age identities,
credential exports, database dumps, encrypted recovery artifacts and scanner reports
must stay outside tracked source. `.gitignore` prevents accidental addition; it
does not remove already-tracked files or historical exposures, nor replace access
controls on local files.

If a genuine exposure is found, report only redacted metadata and stop treating
the credential as confidential. Obtain owner authorization for revocation/rotation,
provider changes and any history remediation. Preserve evidence without copying
the value, verify removal/rotation separately, and never suppress a real finding
to make the check pass. Scanner signatures cannot prove that no unknown credential
exists or that an exposed credential is still valid.
