# Configuration reference

Use this reference alongside [installation](INSTALLATION.md), [provider setup](PROVIDERS.md) and [operations](OPERATIONS.md). Source defaults are defined in [config.ts](../src/server/config.ts); module fields/defaults are defined in [catalog.ts](../src/server/domain/catalog.ts). Return to the [documentation index](README.md).

The [wizard](INSTALLER.md) generates protected `runtime.env` and `compose.json` outside source, uses immutable image IDs and fixes mode/project/data/proxy recovery assumptions in `installation.json`. It does not use the manual Compose interpolation exports below. Do not hand-edit its generated record/Compose or add custom mounts beneath it; custom topologies use manual deployment. Application settings remain the same dashboard/API contracts on both paths.

<!-- contents:start -->
**On this page**

- [Runtime environment](#runtime-environment)
- [Compose host variables](#compose-host-variables)
- [Secrets and storage](#secrets-and-storage)
- [Dashboard settings](#dashboard-settings)
- [Configuration precedence and change scope](#configuration-precedence-and-change-scope)
- [Internal expiry and diagnostics](#internal-expiry-and-diagnostics)
<!-- contents:end -->

## Runtime environment

Source commands load `.env.local` through Node's environment-file option. Containers read the private file selected by Compose's `KEKBOT_ENV_FILE`. Editing an environment file requires recreating the container (`dc up -d --force-recreate kekbot` using the installation helper); `docker compose restart` alone does not load changed environment values. Dashboard module/provider changes take effect without a server restart.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KEKBOT_MODE` | `live` | `live` or explicit `fixture`; missing credentials never select fixtures |
| `KEKBOT_DATA_DIR` | `./data` | Root under which a separate `live` or `fixture` directory is used; Compose overrides to `/data` |
| `KEKBOT_RUN_JOBS` | Off unless `1` | Enable background processing; template/container default is `1`. Keep on for normal operation. |
| `KEKBOT_ENABLE_PROOF` | Off unless `1` | Opt-in diagnostic foundation controls; keep `0` normally |
| `KEKBOT_PUBLIC_URL` | Empty | Exact public HTTPS origin, no path/query/user info; set explicit loopback HTTP for local development, matching the browser origin |
| `KEKBOT_ENCRYPTION_KEY_FILE` | `<data>/<mode>/secrets/encryption.key` | Separate file containing 32 random bytes encoded as 64 hex characters |
| `KEKBOT_PROOF_TOKEN_FILE` | `<data>/<mode>/secrets/proof.token` | Separate generated proof token; required runtime material even with proof controls disabled |
| `KICK_CLIENT_ID` | Empty | Optional environment bootstrap; owner-entered Kick settings take precedence |
| `KICK_CLIENT_SECRET` | Empty | Optional bootstrap secret; prefer dashboard encrypted settings or secret file |
| `KICK_CLIENT_SECRET_FILE` | Unset | Container-visible secret-file alternative to `KICK_CLIENT_SECRET` |
| `KICK_BROADCASTER_USER_ID` | Empty | Positive numeric creator ID; fixture examples use synthetic `123` |
| `KICK_CHAT_TYPE` | `bot` | Official `bot` delivery or `user` delivery as the authorized account; choose explicitly |
| `HOSTNAME` / `PORT` | Template `127.0.0.1` / `3000` | Source listen address/port; Compose sets `0.0.0.0:3000` internally and publishes loopback only |
| `NEXT_TELEMETRY_DISABLED` | Template/container `1` | Framework telemetry disabled; build wrapper also forces this |

Discord and YouTube credentials are entered in **Connections** and encrypted in SQLite; they have no runtime environment variables. Fixture mode rejects live integration settings. Never pass secrets on a command line or publish an environment file. Only the empty [.env.example](../.env.example) belongs in Git.

## Compose host variables

These are used by Docker Compose interpolation, rather than by the application:

| Variable | Default / purpose |
| --- | --- |
| `KEKBOT_ENV_FILE` | `.env.local`; use an absolute private path outside source for hosting |
| `KEKBOT_HOST_DATA_DIR` | `./data`; host directory mounted at `/data` |
| `KEKBOT_SOURCE_REF` | `unknown`; set the reviewed full Git SHA for image provenance |
| `KEKBOT_DOMAIN` | Required by domain override; hostname without protocol/path |
| `KEKBOT_PUBLIC_IP` | Required by IP override; actual public IPv4 without protocol/path |

Set them in the host shell, not merely inside the service's runtime environment file. Do not run plain `docker compose config` in public logs: it expands environment values. Use `config --quiet` for validation. All lifecycle commands must use the same project name, files and data paths. PowerShell uses `$env:NAME = 'value'` for host variables; Linux installation commands use Bash `export`.

## Secrets and storage

With the installation guide's paths:

```text
/srv/kekbot/source/                         Public source checkout
/srv/kekbot/runtime.env                     Private runtime configuration
/srv/kekbot/data/live/kekbot.sqlite          Database (plus SQLite sidecars while running)
/srv/kekbot/data/live/assets/                Uploaded local assets
/srv/kekbot/data/live/secrets/encryption.key Separate encryption key
/srv/kekbot/data/live/secrets/proof.token    Diagnostic token
/srv/kekbot/data/live/secrets/setup.token    Initial owner claim token
/srv/kekbot/backups/                        Private stopped-host snapshots
```

Fixture mode uses `fixture/` and generates additional RSA/Ed25519 signing files plus a seeded account file. `init` preserves existing keys; it creates or renews setup material only while no owner exists. Keep files readable only by the trusted operator/application. The application container needs write access as UID/GID 1000 to its active data directory.

For a separately mounted encryption key, place the original/generated key in protected host storage, bind-mount it at a container path such as `/run/secrets/kekbot-key`, and set `KEKBOT_ENCRYPTION_KEY_FILE` to **that container path**. Use a private Compose override outside the checkout and include it with every lifecycle/CLI command. Provision the key before making a read-only mount; `init` can create a missing key only at a writable path. Apply the same principle to proof/provider secret files.

### Separate key mount example

After the first stopped-host `init`, copy the original key into separately protected storage. These Bash commands assume the installation guide's default paths; they preserve the original file:

```sh
sudo install -d -m 0700 -o 1000 -g 1000 /srv/kekbot/private-keys
sudo install -m 0600 -o 1000 -g 1000 /srv/kekbot/data/live/secrets/encryption.key /srv/kekbot/private-keys/encryption.key
```

Set `KEKBOT_ENCRYPTION_KEY_FILE=/run/secrets/kekbot-key` in the private runtime environment. Create `/srv/kekbot/secrets.compose.yaml` outside source:

```yaml
services:
  kekbot:
    volumes:
      - /srv/kekbot/private-keys/encryption.key:/run/secrets/kekbot-key:ro
```

Include it last on **every** command, for example:

```sh
dc() { docker compose -p kekbot -f compose.yaml -f compose.proxy.yaml -f /srv/kekbot/secrets.compose.yaml "$@"; }
dc config --quiet
dc up -d --force-recreate kekbot
dc exec kekbot node src/cli.ts doctor
```

Retain the same key bytes and an independent protected recovery copy. Merely moving a key within one disk is not independent backup. If a mount fails, stop and check the path/permissions; do not generate a replacement key for an existing database. IP installations substitute their IP proxy override.

Backups contain encrypted database records and assets, but **exclude these secret files, environment configuration and proof captures**. An independent protected copy of the original encryption key is essential to recovery. Caddy certificate/configuration state uses separate Docker volumes; preserving the application directory alone does not preserve certificates. See [backup and recovery](BACKUP_RECOVERY.md).

## Dashboard settings

Owners edit singleton **Instance settings** in **Maintenance**. Lists use one value per line. Time fields ending in `At` use Unix milliseconds; interval/cooldown fields use seconds unless stated otherwise. Current defaults include:

| Setting | Default / behavior |
| --- | --- |
| Rules, Discord link, socials | Empty; utility commands explain missing configuration |
| Media enabled / auto approve | Both off |
| Maximum duration / queue capacity / requests per user | 600 seconds / 50 / 3 |
| Request cooldown / duplicate videos | 30 seconds / disallowed |
| Moderation / timers paused | Both false; configure individual rules/timers deliberately |
| Points enabled / award / cadence / activity window | Off / 10 / 300 seconds / 300 seconds |
| Chat / receipts / summaries / security audits retention | 7 / 30 / 90 / 365 days |

Roles, secret management, source/API tokens and guild mappings have separate permissions. Changing a setting does not grant a missing provider scope. The [user guide](USER_GUIDE.md), [privacy operations](OPERATIONS.md#privacy-and-retention) and [API](API.md) explain the supported actions and retention limits.

The [complete dashboard field reference](CONFIGURATION_FIELDS.md) covers every command, timer, alert, widget, rule, goal, reward, activity, note, guild and settings property. Examples in [docs/examples](examples/README.md) are validated by CI against the same strict schemas used for saves/imports.

## Configuration precedence and change scope

| Input | Effective behavior | How to apply a change |
| --- | --- | --- |
| Process environment / selected runtime file | Read at startup; an already-set process variable takes precedence over Node's env-file loading | Recreate container or restart source process |
| Compose `environment` | Overrides service `env_file`, including `/data`, internal hostname and port | Recreate with the same complete Compose file set |
| `KICK_CLIENT_SECRET_FILE` | Read file instead of inline client-secret environment value | Replace protected file and recreate/restart |
| Saved Kick application settings | Encrypted dashboard settings override environment bootstrap | Save the complete form, reauthorize, reconcile subscriptions |
| Module documents/settings | Read from SQLite; versioned edits apply at runtime | Save, inspect current state and affected queued work |
| Discord/YouTube settings | Encrypted dashboard-only inputs; no environment alternative | Save complete replacement settings and verify actual action |

Never switch a live database into fixture operation. Mode selects separate subdirectories under the data root; it does not convert existing data. Keep proof tools off except during the explicitly controlled diagnostic workflow.

Startup still validates configured secret-file paths even when saved integration settings take precedence. Remove obsolete bootstrap file variables deliberately; do not leave them pointing to deleted files. The installation key and proof-token files are always required runtime material.

## Internal expiry and diagnostics

Temporary login/cooldown/request/chat-window/Discord-result state expires internally; there are no new environment fields to configure it. Chat and receipt retention also govern job payload/marker cleanup; see [operations](OPERATIONS.md#privacy-and-retention). The host tool's `--diagnostics-dir` is a command-line option, not an application/container setting or a configuration-export field.
