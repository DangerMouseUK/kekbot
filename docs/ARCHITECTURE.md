# KekBot architecture decisions

Date: 2026-10-01. Status: implementation decisions selected; single-owner foundation live gate passed 2026-10-02.

## ADR 001 — One self-hosted application

Use one pnpm project and a single long-running Node.js 24 runtime. Next.js App Router owns React presentation and HTTP routing. Provider clients, domain services, persistence, and jobs are separate TypeScript modules under `src/server`. No Redis, PostgreSQL, remote object storage, external worker, or multi-customer model is introduced.

Ship standalone output in a non-root Debian-based container. The builder has native compilation tools; the runtime does not. Use an operator-controlled HTTPS reverse proxy or tunnel, with the direct application port bound to loopback. Windows/macOS containers require Docker Desktop; production support starts with Linux x86-64/local disk.

## ADR 002 — SQLite is authoritative

Use better-sqlite3 with Drizzle ORM and checked-in SQL migrations. Enable foreign keys, WAL, synchronous FULL, and a bounded busy timeout. Transactions never contain network waits. Unique receipt/action IDs suppress duplicate local transitions; incoming receipts and jobs commit together. Local transitions and pending effects commit together.

Job state is pending/running/succeeded/failed/uncertain. Leases recover abandoned local work; abandoned outbound sends become uncertain because the provider may have accepted them. Only explicit rate-limit responses are automatically retried, with bounded delay and attempt count. Do not promise exactly-once external delivery.

An instance lease prevents a second runtime or offline maintenance process from operating concurrently. A dead instance lease expires within 30 seconds; startup waits for its expiry. Multiple replicas/network-filesystem SQLite remain unsupported.

Use a real SQLite backup snapshot, not a copy of a live WAL database. Foundation backups require the application to be stopped and include local assets/checksums. Restore validates schema, mode, original key fingerprint, database integrity, and asset hashes before publishing to new storage. Never overwrite an existing installation during restore.

## ADR 003 — Explicit runtime lifecycle

Next.js instrumentation imports Node-only bootstrap code when `NEXT_RUNTIME=nodejs` and `KEKBOT_RUN_JOBS=1`. A process-global runtime singleton prevents duplicate runner initialization. Processing is bounded to ten jobs per tick, with leased ownership and storage-backed heartbeats. No HTTP request or browser tab owns the scheduler.

The build wrapper forces `KEKBOT_RUN_JOBS=0` and disables framework telemetry. Runtime data/secret paths are excluded from standalone tracing. Production startup uses manual signal handling for graceful lease release. Development fixtures use their own data directory and signing key and reject live credentials before any provider operation.

## ADR 004 — Authentication and provider trust

The foundation temporarily uses a random host-managed proof token for operator endpoints; it is neither a default password nor a public setup route. OAuth also binds state to an HttpOnly, SameSite browser cookie. Tokens and PKCE material use AES-256-GCM with purpose-specific authenticated data; the encryption key lives outside the database and backup.

The next accounts increment adds Argon2id passwords, revocable sessions, one-time owner setup, expiring invitations, and the four PRD roles. It will replace foundation operator access before a v0.1 release. Widget reads and player acknowledgements receive separate revocable authority; account secrets never enter public state.

Kick requests use fixed official hosts with redirects rejected and timeouts bounded. Verification uses the original request bytes and a key from the trusted Kick endpoint, never a caller header. The foundation accepts three documented event types for the configured broadcaster only. Its provisional signed-timestamp window is 48 hours with five minutes of future tolerance, based on documented retries extending beyond a day; live retry observations must confirm or revise this before release.

## ADR 005 — Web interfaces and later modules

Use Next.js route handlers with uncached operational responses. Add authenticated SSE with stored event IDs/snapshot recovery when shared dashboard/widget state is built. Browser, Discord, and Kick controls call shared domain services. Owner integration tokens/API arrive after core workflows stabilize.

Media preserves the current item/queue after restart, pauses until moderator resume, then restarts the item from the beginning. Only one active player lease can acknowledge completion. Stale/disconnected players never advance a newer item.

## References

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Startup instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [Standalone output and file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow)
- [Kick webhook security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md)
- [Kick API contract](https://api.kick.com/swagger/doc.yaml)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [better-sqlite3 backup API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
