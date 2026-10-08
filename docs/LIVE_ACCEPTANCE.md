# Live acceptance campaign

This is Milestone 18's operator runbook for the complete candidate. **Deployment is deferred; no new live campaign has run.** The original foundation droplet was destroyed. Historical foundation results remain valid only for their recorded source and scenarios. Do not assume its database, grants, captures, certificates or backups survived.

Complete [automated candidate verification](TESTING.md) first. Use [installation](INSTALLATION.md), [provider setup](PROVIDERS.md), [OBS](OBS.md) and [backup/recovery](BACKUP_RECOVERY.md) for actual procedures, [API](API.md) for contracts and [milestones](MILESTONES.md) for sign-off. Return to the [documentation index](README.md). This document contains reusable examples only. Keep actual infrastructure/provider details and detailed results in a private operator setup record outside the checkout, with protected credential/evidence files referenced rather than copied into it.

## Candidate and environment record

Before testing, record privately:

- Exact clean source commit, application version, image digest and `org.opencontainers.image.revision` label; schema and backup format.
- CI run URL and all job outcomes for that commit. Record fixes as new candidates and rerun affected checks.
- Linux x86-64 host OS, CPU allocation, RAM, SSD/filesystem and container limits; driver/browser/OBS versions. The PRD reference host is 2 vCPUs / 2 GiB RAM with local persistent SSD. Image compilation is separate.
- Independent installation/operator labels, dates and scenarios. Public evidence uses anonymous labels such as Operator A/B/C, never account names or addresses.
- Private locations of runtime configuration, installation key, provider credentials, persistent storage and tested backup. Verify keys/backups are available before relying on restoration.

Do not count different browser profiles or two directories on one installation as independent owners or another-host restoration.

## Infrastructure and secure installation

| ID | Procedure | Required result |
| --- | --- | --- |
| L01 | Provision authorised fresh infrastructure. Verify the SSH host fingerprint through the provider's trusted console before first SSH connection. Agree access/firewall rules with the operator. | Correct host identity; operator SSH and provider-console access work. No silent access restrictions. |
| L02 | Install Docker Engine/Compose using official instructions. Deploy the exact candidate, external runtime files and UID/GID 1000-writable persistent storage. | Non-root application; direct port bound to loopback; only intended ingress exposed; image/source identity matches. |
| L03 | Configure the documented domain or public-IP HTTPS proxy and persistent certificate storage. Verify with an ordinary browser/client without insecure TLS flags. | Publicly trusted hostname/IP certificate, correct chain/SAN, streaming works. If an IP is used, explicitly use the short-lived profile. |
| L04 | Claim a fresh installation with its private one-time setup token, log in, invite each role and restart. | Setup cannot be reused; Secure/HttpOnly/SameSite session cookie over HTTPS; settings/accounts survive. |
| L05 | Test a clean upgrade from the foundation schema with pre-upgrade backup. Simulate migration failure only on disposable copied storage; restore the pre-upgrade backup with the matching old candidate. | Preserved records on upgrade; failure remains recoverable; no unsupported downgrade against newer storage. |
| L06 | Observe actual scheduled certificate renewal and then restart the proxy. | Renewed trusted certificate and retained certificate state. A renewal configuration check or re-issuance alone is insufficient. |

For IP ingress, check current Kick callback acceptance early; historical acceptance is not a guarantee for a new app. Record a precise redacted rejection and select another authorised ingress method if necessary. Never weaken TLS verification to pass a test. Official references: [Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Let's Encrypt IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability).

## Provider setup and complete creator sessions

Use dedicated test accounts/channels and owner-controlled applications. Select the required scopes from OPERATIONS.md; broad test permissions are not normal installation defaults. Discord and YouTube may be disabled in ordinary installations, but both complete workflows must pass release acceptance. Never print secrets in shell arguments, logs or public evidence.

| ID | Procedure | Required result |
| --- | --- | --- |
| L07 | Authorise the intended Kick creator in the same browser using exact HTTPS callback/webhook URLs. Reconcile required subscriptions twice. | Matching numeric creator, scopes, signed delivery; repeated reconciliation creates no duplicates. |
| L08 | From a separate viewer, exercise built-ins and custom aliases, edits, response pools/counters, cooldowns and role/live restrictions. Close every dashboard while sending normal controlled traffic. | Correct visible replies and sender identity; edits apply without restart; denied/cooldown cases produce no unwanted effects; worker operates independently. |
| L09 | Exercise interval/activity/quiet-hour timers while live, offline, paused and after restart. | Correct cadence; no catch-up flood. Record actual stream-state delivery and unavailable-provider cases honestly. |
| L10 | Receive a real follow and supported subscription/new/renewal/gift variants where available; trigger manual and goal alerts with local image/sound assets. | Correct OBS presentation/audio, bounded queues and no fixture history mixed into live records. A paid/unavailable event remains pending; do not purchase one without approval. |
| L11 | Configure two allowed Discord guilds with different event routing, role and identity grants. Register enabled slash commands. Use permitted actions and attempt them as ordinary/unauthorised members. | Only configured notifications; initial HTTP acknowledgement under three seconds; deferred results; no cross-guild authority or duplicate effects. |
| L12 | Exercise permitted manual delete/timeout/ban and automatic link/phrase/repetition/caps/burst rules, trusted exceptions, escalation, temporary policy and emergency pause. Use consenting test identities. | Accurate incident/outbound outcomes, permitted messages untouched, errors visible; irreversible actions explicitly acknowledged. |
| L13 | Submit real YouTube `!sr` requests, validate metadata/rules, approve in Discord, then play through a visible OBS embedded player. | Full Kick → Discord → OBS → one durable queue advance. Official metadata/player only; no download/extraction. |
| L14 | Try invalid/non-embeddable/over-limit/duplicate videos, exhausted/rejected API key, duplicate approval, two players, stale completion, skip/completion, autoplay block and disconnect. | Explicit errors; one lease; no duplicate/automatic failure advance. Restart preserves the current item paused; moderator resume restarts it from the beginning. |
| L15 | Exercise points accrual/estimated watchtime, concurrent rewards, fulfilment/refund, poll changes/deadlines, raffle eligibility/draw/reroll and associated Discord/widgets. | Durable audited balances; no overspend/double award/refund/vote; estimates labelled honestly; winners recorded. |
| L16 | Inspect all 18 widget families and three themes at intended OBS dimensions, preview alerts, reconnect and revoke each source/player credential. | Safe text, readable/translucent layouts, audio/autoplay outcomes, reduced motion, synchronized state and immediate access denial. |
| L17 | Compare observed analytics with the controlled session, use date/stream filters and CSV/JSON. Exercise retention/erasure and inspect support/native config exports privately. | Supported observations match; gaps/unknown data shown; no credentials/private history in support/config exports; native import previews conflicts and preserves assets. |

Record consent and provider limits privately. Do not test moderation against uninvolved viewers or generate artificial load in public chat. YouTube reference: [metadata API](https://developers.google.com/youtube/v3/docs/videos/list), [player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality). Discord reference: [interactions](https://docs.discord.com/developers/interactions/receiving-and-responding).

## Failure, privacy and recovery campaign

| ID | Procedure | Required result |
| --- | --- | --- |
| L18 | Revoke dashboard sessions and API/widget/player tokens, including during active SSE streams and pending permitted jobs. Attempt cross-origin/CSRF and insufficient-scope actions with synthetic requests. | Access closes promptly; pending jobs recheck authority; source access cannot moderate. Never expose bearer values in screenshots/results. |
| L19 | Observe real Kick token refresh and removed-subscription repair. Revoke the dedicated test grant at the provider, attempt an action, then browser-reauthorise and reconcile. | Sanitised failed/repair state; no infinite unsafe retry; authorised chat works again. |
| L20 | Interrupt provider/network access and ambiguous sends on isolated test routing; disconnect the dashboard and OBS. Inspect uncertain jobs before explicit reconciliation. | No blind resend; clear failures/uncertainty; snapshot recovery after reconnect; playback never silently advances. |
| L21 | Restart and abruptly terminate the application mid-session; verify acknowledged accounts/configuration/queue/ledger/participation/receipts. Perform a controlled host power-loss test only on disposable infrastructure with a verified backup. | Preserved committed state, rolled-back incomplete work, safe expired leases, moderator media resume. Record physical power loss separately from process kill. |
| L22 | Stop and back up a populated database with uploaded assets and separately protected keys. Restore onto a genuinely different host, update callbacks and reauthorise as required. | All module counts/balances/current queue/assets/receipts preserved; duplicate delivery still cannot act; original key required; measured recovery time. |
| L23 | Use stopped-host owner recovery with a protected password file. Then attempt old sessions and source/API credentials. | Owner can log in; old owner sessions/tokens fail; product data survives. |
| L24 | Block project-operated domains while retaining the declared provider dependencies. Repeat with optional integrations disabled. | Independent normal operation; no project account, central relay, telemetry or maintainer credentials required; disabled modules stay isolated. |

Do not deliberately fill the operator's real disk. Use disposable bounded storage for device-level capacity/read-only tests; automated SQLite and container checks cover the safe simulations. Record failed restore media and retain the original verified backup. A same-host copied directory is useful fixture evidence but does not pass L22.

## Reference workload and measurements

First run the [fixture workload harness](TESTING.md) against the exact image on the reference host. Keep the driver and five browsers on a separate machine. The full profile uses 100% command/reply traffic, one-hour 25/s sustained input and a 60-second 100/s burst. Record achieved input rate and any client saturation/rejected intake. Measure application/container memory separately from host/build/driver/browser memory; a shared CI runner cannot establish reference performance.

| ID | Measurement | Required result |
| --- | --- | --- |
| P01 | Host/image/workload identity | Linux x86-64; 2 vCPUs; 2 GiB RAM; local persistent SSD; identified image and separate driver |
| P02 | Sustained and burst delivery | 25 chat events/s for one hour, 100/s for 60 seconds, five browser clients; no lost acknowledged events |
| P03 | Memory and backlog | Application memory below 750 MiB after warm-up; bounded backlog; burst drains within two minutes |
| P04 | Local decision and visible update | p95 local decision below 250 ms; dashboard/widget update below one second; document sampling definitions |
| P05 | Real-provider reply | Below two seconds with healthy provider; separately report provider/network/rate-limit waits; use normal controlled traffic |
| P06 | Restart and recovery | Healthy local job recovery within 30 seconds; small-instance backup restore within 15 minutes; separately time reauthorisation |
| P07 | Acknowledged state | Survives the process/host failure scenarios with no duplicate economic/queue/provider effects |

The harness reports receipt-to-decision including queue wait, rather than pretending it measures pure function execution. Keep raw report files private. Collect application RSS and container memory through the run, not merely a single final sample. For a remote run, measure stop/start and a queued local probe on the server; the driver does not restart a remote host. Record backup size, asset count and when availability returns. An unrun target stays pending even if a smoke test passed.

## Independent operators and sign-off

At least two independent owners must use separate provider applications, channels, installations and storage and complete the live sessions. Three independent operators must install from the public documentation without maintainer intervention; at least two also complete those sessions. Record assistance, failures and usability/accessibility feedback honestly. Include keyboard-only navigation, intended display sizes, contrast/reduced-motion checks, and assistive-technology review beyond automated axe coverage.

Maintain a private evidence row for each L/P scenario:

The [release evidence index](release-evidence.json) mirrors these 31 scenarios and adds O01/O02 for independent owners/installers. It starts entirely pending. Record sanitized dated public summaries in [RELEASE_READINESS.md](RELEASE_READINESS.md) only after the frozen source/image passes; raw evidence remains private. [RELEASING.md](RELEASING.md) explains the separate candidate and sign-off commits, image identity and fail-closed stable check. A hosted full-duration fixture soak is additional automated evidence and does not pass this campaign.

| Scenario | Candidate/image | Operator label | Date | Outcome | Evidence location | Defect/retest |
| --- | --- | --- | --- | --- | --- | --- |
| L01–L24 / P01–P07 | Exact source/image | A/B/C | UTC date | Pending / pass / fail / unavailable | Private reference only | Sanitised issue or retest reference |

Public summaries contain dates, anonymous operator labels, source/image versions and outcomes only. A genuine missing provider capability is an unresolved requirement decision, not a passing test. Any code fix produces a new candidate: rerun its affected automated and live scenarios. Do not sign off unresolved authorisation, secret exposure, data loss, duplicate economic/queue transitions or unsafe retries.

Milestone 18 passes only when the required live, independent, TLS-renewal, another-host restore and reference targets have evidence. Release publication remains Milestone 19 and needs explicit authorisation. Before finishing the campaign, revoke temporary test grants/source tokens, disable proof tooling, review retention, preserve authorised backups/keys and remove disposable fixture infrastructure when approved.
