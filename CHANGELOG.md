# Changelog

## 0.0.1 — Foundation work, unreleased

- Corrected the project name to KekBot, selected MIT and Next.js, and moved the complete connected media workflow into v0.1.
- Added the pinned Next.js/Node/pnpm project, SQLite migrations, durable receipt/job pipeline, and standalone background runtime.
- Added owner-supplied Kick OAuth with PKCE, encrypted tokens, refresh, trusted-key webhook verification, channel isolation, subscription reconciliation, and a bounded `!kekbot` proof reply.
- Added protected foundation controls, explicit fixture mode, health checks, initialization/diagnostics, and offline consistent backup/restore with assets.
- Added test fixtures, real SQLite/provider/runtime tests, browser checks, container examples, and CI configuration.
- Prepared public contribution/security guidance, issue and pull-request templates, consistent line endings, ignored private artifacts, pinned CI actions, documentation checks, and a redacted Git-history secret scan.

Linux build/container verification passed in GitHub CI. Live provider acceptance and independent-owner trials remain pending. This version does not implement the remaining v0.1 modules.
