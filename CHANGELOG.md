# Changelog

## 0.0.1 — Foundation work, unreleased

- Corrected the project name to KekBot, selected MIT and Next.js, and moved the complete connected media workflow into v0.1.
- Added the pinned Next.js/Node/pnpm project, SQLite migrations, durable receipt/job pipeline, and standalone background runtime.
- Added owner-supplied Kick OAuth with PKCE, encrypted tokens, refresh, trusted-key webhook verification, channel isolation, subscription reconciliation, and a bounded `!kekbot` proof reply.
- Added protected foundation controls, explicit fixture mode, health checks, initialization/diagnostics, and offline consistent backup/restore with assets.
- Added test fixtures, real SQLite/provider/runtime tests, browser checks, container examples, and CI configuration.
- Prepared public contribution/security guidance, issue and pull-request templates, consistent line endings, ignored private artifacts, pinned CI actions, documentation checks, and a redacted Git-history secret scan.
- Added protected shared Kick refresh, one-event encrypted proof capture, committed-event replay checks, and additional provider/SQLite/browser acceptance coverage.
- Added a pinned Caddy public-IP HTTPS example, external Compose configuration/data paths, and offline proxy configuration checks in CI.
- Made new SQLite backup snapshots portable to read-only recovery mounts; added container restoration, asset and replay checks to fixture-only CI.
- Added publication-policy checks and wider Git/Docker exclusions for private runtime configuration, credentials, captures, diagnostics and setup records.

The single-owner live Kick foundation gate passed on 2026-10-02, supported by local and Linux/container verification. Independent-owner trials and another-host restoration remain release-candidate requirements. Installation and accounts is next; this version does not implement the remaining v0.1 modules.
