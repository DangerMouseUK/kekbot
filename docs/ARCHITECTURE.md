# KekBot architecture decisions

Updated: 2026-10-08. Status: foundation live gate passed historically; product build and automated candidate campaign complete; live acceptance/release pending.

This is the design reference for contributors. Use [installation](INSTALLATION.md) for deployment, [configuration](CONFIGURATION.md) for runtime inputs, and [contributing](../CONTRIBUTING.md) for the source map/workflow. Return to the [documentation index](README.md).

## ADR 001 — One self-hosted application

Use one pnpm project and a single long-running Node.js 24 runtime. Next.js App Router owns React presentation and HTTP routing. Provider clients, domain services, persistence, and jobs are separate TypeScript modules under `src/server`. No Redis, PostgreSQL, remote object storage, external worker, or multi-customer model is introduced.

Ship standalone output in a non-root Debian-based container. The builder has native compilation tools; the runtime does not. Use an operator-controlled HTTPS reverse proxy or tunnel, with the direct application port bound to loopback. Windows/macOS containers require Docker Desktop; production support starts with Linux x86-64/local disk.

## ADR 002 — SQLite is authoritative

Use better-sqlite3 with Drizzle ORM and checked-in SQL migrations. Enable foreign keys, WAL, synchronous FULL, and a bounded busy timeout. Transactions never contain network waits. Unique receipt/action IDs suppress duplicate local transitions; incoming receipts and jobs commit together. Local transitions and pending effects commit together.

Job state is pending/running/succeeded/failed/uncertain. Leases recover abandoned local work; abandoned outbound sends become uncertain because the provider may have accepted them. Only explicit rate-limit responses are automatically retried, with bounded delay and attempt count. Do not promise exactly-once external delivery.

An instance lease prevents a second runtime or offline maintenance process from operating concurrently. It renews every five seconds independently of provider I/O. A dead instance lease expires within 30 seconds; startup waits for its expiry. Multiple replicas/network-filesystem SQLite remain unsupported.

Use a real SQLite backup snapshot, not a copy of a live WAL database. Backups require the application to be stopped and include local assets/checksums. Restore validates schema, mode, original key fingerprint, database integrity, and asset hashes before publishing to new storage. Never overwrite an existing installation during restore; follow [backup/recovery ordering](BACKUP_RECOVERY.md).

## ADR 003 — Explicit runtime lifecycle

Next.js instrumentation imports Node-only bootstrap code when `NEXT_RUNTIME=nodejs` and `KEKBOT_RUN_JOBS=1`. A process-global runtime singleton prevents duplicate runner initialization. Processing is bounded to 50 jobs or 200 ms of elapsed batch time, checked between jobs, then yields for 100 ms. An in-flight bounded provider request can exceed that elapsed budget; independent lease/heartbeat renewal continues during asynchronous I/O. Completion and its audit/live events commit together. No HTTP request or browser tab owns the scheduler.

The build wrapper forces `KEKBOT_RUN_JOBS=0` and disables framework telemetry. Runtime data/secret paths are excluded from standalone tracing. Production startup uses manual signal handling for graceful lease release. Development fixtures use their own data directory and signing key and reject live credentials before any provider operation.

## ADR 004 — Authentication and provider trust

Normal operator access uses Argon2id local accounts, revocable database sessions, same-origin JSON/CSRF checks and one-time host-token owner setup. Invitations expire and can be used once. Owner/Admin/Moderator/Read-only powers are checked at server entry points and in shared domain services. Queued human/API/Discord actions recheck their authority before execution. Retained proof endpoints are explicitly opt-in and require owner sessions in live mode. OAuth also binds state to an HttpOnly, SameSite browser cookie. Tokens and PKCE material use AES-256-GCM with purpose-specific authenticated data; the encryption key lives outside the database and backup.

Node 24's built-in asynchronous Argon2id uses 64 MiB / three passes / one lane with a unique salt, and hashing concurrency is bounded. Widget reads, player acknowledgements and owner API tokens have separate hashed, revocable authority. API tokens are scoped and cannot manage secrets or accounts. Account secrets never enter public state.

Kick requests use fixed official hosts with redirects rejected and timeouts bounded. Verification uses the original request bytes and a key from the trusted Kick endpoint, never a caller header. Intake accepts documented chat/follow/stream and subscription variants for the configured broadcaster only. Its provisional signed-timestamp window is 48 hours with five minutes of future tolerance, based on documented retries extending beyond a day; live retry observations must confirm or revise this before release.

## ADR 005 — Web interfaces and media recovery

Use Next.js route handlers with uncached operational responses. Authenticated SSE uses durable IDs, bounded replay and snapshot recovery; active sessions/source tokens are rechecked. Browser, signed Discord, verified Kick and scoped owner API actions call shared domain services. Discord interaction tokens are encrypted in durable jobs and never retained in receipt bodies.

Media preserves the current item/queue after restart, pauses until moderator resume, then restarts the item from the beginning. Only one active player lease can acknowledge completion. Stale/disconnected players never advance a newer item.

## ADR 006 — Local module state and portable configuration

Schema 2 adds explicit account/session/token, queue, ledger/redemption, participation, incident, observation, audit and SSE tables. Declarative module configuration uses validated, versioned documents; internal ephemeral state uses bounded settings records. The checked-in schema 1→2 migration preserves foundation records and refuses upgrades while another runtime owns the lease.

Media decisions and player acknowledgements use optimistic versions inside short transactions. Points are an append-only ledger, vote/entry identities are unique, and raffle selection uses cryptographic randomness with audited rerolls. Moderation rules are bounded string/window evaluations; templates, themes and imports execute no caller code. Incoming stream timestamps prevent stale status transitions.

Analytics count only observed events, distinguish viewer samples from totals and expose missing worker coverage. Retention never deletes balances or pending queue decisions. Owner privacy actions state which integrity identifiers remain. Support bundles omit host/credential/raw-history data. Native configuration exports include validated asset bytes and remapped references, exclude authority/secrets/private history, and apply database changes atomically; failed imports clean up newly created assets. A process crash during file creation can leave an unreferenced asset for host inspection, without installing uncommitted configuration.

Current module/service interfaces and operator workflows are documented in [API.md](API.md) and [OPERATIONS.md](OPERATIONS.md). [TESTING.md](TESTING.md) covers failure/concurrency/browser/container campaigns; [LIVE_ACCEPTANCE.md](LIVE_ACCEPTANCE.md) covers real-provider and operational evidence. [MILESTONES.md](MILESTONES.md) separates implementation, automated, live and release gates.

## References

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Startup instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [Standalone output and file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow)
- [Kick webhook security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md)
- [Kick API contract](https://api.kick.com/swagger/doc.yaml)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [better-sqlite3 backup API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
