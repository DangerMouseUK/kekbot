# Security reporting

This repository is pre-release and has no supported stable version yet.

Maintainers review dependencies through [release-controlled maintenance](docs/DEPENDENCY_MAINTENANCE.md), including development/build tooling and the final image. A clean production-only npm audit is insufficient for stable sign-off. Advisory details and raw runtime diagnostics stay private until reviewed for disclosure. Optional installer diagnostics contain bounded lifecycle metadata only; inspect even those before sharing. No automated upgrade or deployment is implied by a security report.

For ordinary setup/use problems, start with [troubleshooting](docs/TROUBLESHOOTING.md). The [documentation index](docs/README.md) links installation, provider and recovery procedures.

Do not put credentials, private chat history, or exploit details affecting an operator into a public issue. Use GitHub's **Report a vulnerability** option on this repository's Security tab when available. If it is unavailable, open an issue titled **Request private security contact** containing only that request; a maintainer will arrange a private channel before you share the report. No personal email address or operator credentials are required in a public issue.

Reports should describe the affected version, deployment mode, entry point, required permissions, impact, and a minimal redacted reproduction. Do not test against another operator's installation without authorization.

The expected boundaries are one creator per installation, server-side role authorization, independently verified provider callbacks, isolated fixture data/actions, encrypted provider credentials, scoped widget/player credentials, and local durable state. Missing credentials never enable demo mode. Arbitrary executable extensions and multiple replicas sharing a SQLite file are outside the initial supported deployment.

## What to include privately

The [host wizard](docs/INSTALLER.md) runs with root/Docker authority, separately from dashboard roles. Only run reviewed tool/application commits; branch/PR builds can execute arbitrary code. Release checksums establish integrity, not a publisher signature. Managed files/checkpoints remain private outside Git; default uninstall retains them, while explicitly confirmed purge destroys the managed root and its certificate volumes. Report path/verification/authority bypasses privately. The tool never changes SSH/firewalls or asks for provider credentials.

- Affected source commit/version and installation mode; avoid actual host addresses unless privately necessary.
- Entry point and minimum required authority, such as a viewer message, Discord role, widget credential or local account.
- Expected boundary, observed impact and a minimal synthetic/redacted reproduction.
- Whether data, external actions or credentials could be affected, and any safe mitigation you have already verified.

Do not include a usable secret in the initial report. Maintainers may arrange a protected exchange if further evidence is necessary. There is no published response-time guarantee or bug-bounty program. Do not perform destructive testing, load testing or provider mutations against an installation you do not control.

## Operator response to exposed credentials

Revoke/rotate the affected credential at its authority boundary: provider portal for application secrets/grants, Maintenance for source/player/API tokens, Accounts for operator sessions/access, and the host's own tools for SSH access. Remove an exposed file from public artifacts, but do not assume deletion invalidates a copied credential. Owner recovery revokes that owner's sessions/access tokens; it does not rotate provider secrets or other users' sessions.

Preserve relevant evidence privately and review actual provider outcomes before repeating uncertain actions. Follow [recovery](docs/BACKUP_RECOVERY.md) for storage compromise and [operations](docs/OPERATIONS.md) for data retention. Losing the original installation key prevents the supported encrypted-data restore path; keep it independently protected.
