# Security reporting

This repository is pre-release and has no supported stable version yet.

Do not put credentials, private chat history, or exploit details affecting an operator into a public issue. Use GitHub's **Report a vulnerability** option on this repository's Security tab when available. If it is unavailable, open an issue titled **Request private security contact** containing only that request; a maintainer will arrange a private channel before you share the report. No personal email address or operator credentials are required in a public issue.

Reports should describe the affected version, deployment mode, entry point, required permissions, impact, and a minimal redacted reproduction. Do not test against another operator's installation without authorization.

The expected boundaries are one creator per installation, server-side role authorization, independently verified provider callbacks, isolated fixture data/actions, encrypted provider credentials, scoped widget/player credentials, and local durable state. Missing credentials never enable demo mode. Arbitrary executable extensions and multiple replicas sharing a SQLite file are outside the initial supported deployment.
