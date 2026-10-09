# Words you will see in the guides

You do not need to learn this list before installing. Use it when a guide or prompt contains an unfamiliar term. [Getting started](GETTING_STARTED.md) · [Documentation hub](README.md).

| Term | Plain-English meaning in KekBot |
| --- | --- |
| Server / host | The computer that runs KekBot. For a live bot, it stays on and connected to the internet. |
| Self-hosted | You run the software on a computer you control instead of using a project-operated online service. |
| Linux x86-64 / amd64 | The supported server operating-system/processor combination. Intel/AMD 64-bit processors use these architecture names; ARM64 is a different unsupported distribution target. |
| Terminal / command line | A window where you type commands. The install walkthrough tells you which computer to use. |
| Bash | The command shell used by the Linux launcher and shell examples. |
| SSH | A secure terminal connection to your server. SSH access is separate from your KekBot account. |
| sudo / root | Administrator authority on Linux. It can change the host, so only run tools you trust. |
| Docker | Software that runs KekBot's packaged application in a container. Recommended setup handles normal Docker configuration. |
| Container | A running instance of the packaged app, with its own filesystem and explicitly connected persistent storage. |
| Image | The package used to create a container. Removing a container does not necessarily delete its data or image. |
| Compose / project | Docker's way to describe related services. The project name keeps one installation's containers and volumes together. |
| Volume / persistent data | Storage that survives replacing a container. KekBot's database, uploads and keys need persistent storage. |
| Installation root | The dedicated host directory holding one managed installation. The recommended location is `/srv/kekbot`. |
| Managed / manual installation | Managed uses the wizard's generated records and recovery rules. Manual means you maintain your own Compose/configuration. Do not mix their commands. |
| Local / loopback / 127.0.0.1 | Access from that same computer only. Your laptop's loopback address is different from your server's. |
| Port | A numbered network endpoint. Bundled HTTPS uses public 443 and certificate validation can use 80; KekBot's direct 3000 port stays local. |
| Domain / DNS | A readable internet name and the service that points it to a server's address. |
| HTTPS / TLS / certificate | Encrypted web access with a verified server identity. The certificate must be trusted without bypassing browser validation. |
| Origin | The starting web address: scheme, hostname/IP and optional port, for example `https://bot.example.com`. It has no page path. |
| Proxy / Caddy | The web server in front of KekBot that can handle public HTTPS and forward requests to its private local port. |
| Callback / webhook | A URL a provider calls to deliver an authorization result or an event such as a chat message. |
| Integration / provider | A service KekBot connects to: Kick, Discord or YouTube. Discord/YouTube are optional. |
| Provider application | An app you register with Kick or Discord to give your installation access. Its name does not decide the Kick reply sender. |
| OAuth / grant / scope | Provider authorization, the resulting permission grant, and the specific permissions requested. It is separate from your local owner login. |
| Creator / broadcaster ID | The numeric provider identity of the channel this installation serves. A channel name and developer app ID are different values. |
| Owner / moderator / read-only | Local account roles controlling what someone can view or change. Provider permissions are separate. |
| Token / secret / private source URL | A credential that grants access. Keep it out of screenshots, public logs and issue reports. |
| Encryption key | The separate file protecting stored provider credentials. Backups exclude it; keep an independent protected copy. |
| Fixture / demo | An isolated installation with simulated data/effects. It does not send real provider actions or play real YouTube. |
| Beta / prerelease | A published test version. Full live/stable acceptance is still pending. |
| Latest stable | The newest published release accepted for stable use. It never silently selects a beta. |
| Source / branch / PR / commit / tag | Code, a moving development line, a proposed change, an exact code revision, and a named revision. These are advanced install choices. |
| SHA / digest / checksum | A fingerprint of a commit or file/image. Matching fingerprints detect changed content; they are not a publisher signature or proof that software has no vulnerabilities. |
| Migration / schema | A controlled database-format change and the format version. Updates run checked-in migrations after taking a snapshot. |
| Snapshot / backup / rollback | A point-in-time recovery copy, independent recovery material, and returning to a previous image/data checkpoint. Changes after the snapshot are absent. |
| Lease | A time-limited claim preventing two workers or players from acting as the current owner simultaneously. |
| Uncertain delivery | The provider may have received an action, but confirmation was lost. Inspect/reconcile it instead of blindly sending it again. |
| SSE | A long-lived web connection that updates dashboard/widgets. A proxy must allow streaming. |
| OBS Browser Source | An OBS source that displays a web page, used for KekBot alerts, widgets and visible media playback. |
| CI / automated checks | Tests run on GitHub. They provide automated evidence, not proof of real provider delivery or unaided installation. |

Technical details remain in [configuration](CONFIGURATION.md), [architecture](ARCHITECTURE.md) and [API](API.md); everyday tasks are in the [user guide](USER_GUIDE.md).
