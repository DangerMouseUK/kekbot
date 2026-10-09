# Application runtime and binary review

This guide explains the candidate image's contents, compatibility and maintenance. Start installation at [the guided installer](INSTALLER.md) or [manual hosting](INSTALLATION.md); release status is tracked in [readiness](RELEASE_READINESS.md). These packaging changes do not establish live or stable acceptance.

## What is shipped

The Dockerfile uses official Node `24.21.0-alpine3.24` stages pinned to one manifest digest. A separate empty root receives musl 1.2.6, libgcc and libstdc++ 15.2.0 from signed Alpine repositories, followed by Node and standalone application output. The original apk package database remains in `/lib/apk/db/installed`; it is not removed or rewritten to suppress findings. Exact package revisions and build commits are copied into the runtime notice inventory.

The final image starts from `scratch`, runs as UID/GID `1000:1000` and contains no shell, apk, compiler, npm, Corepack or Yarn. Docker provides its normal `/dev`, hosts and DNS mounts. Node supplies the bundled certificate store. `/data` is persistent, and the normal read-only deployment allows only its data volume and bounded `/tmp` mount to write.

Next's image optimizer is disabled globally. Local alert images already use unoptimized authenticated/scoped URLs; their delivery behavior stays the same. Sharp and its native libvips dependencies are excluded from standalone tracing and the distributed notice graph. The build rejects accidental inclusion, and container checks require the unused `/_next/image` endpoint to return 404. The lockfile may retain these optional build dependencies; their presence there does not mean their binaries are shipped.

## Compatibility and maintenance

The supported distribution remains Linux amd64. Alpine uses musl instead of glibc, so the native SQLite addon is built/selected on the same platform as the runtime. Do not copy a Windows or glibc `node_modules` into this image. Official Node Docker tests its Alpine variant, but Node classifies amd64 musl support as experimental; see [the upstream image documentation](https://github.com/nodejs/docker-node/blob/main/README.md). Keep this limitation visible during beta evaluation.

Use the documented Node CLI commands instead of opening a shell. For example, from the Compose checkout with the installation's external environment paths configured, this read-only diagnostic prints the runtime version and identity:

```sh
docker compose exec kekbot node -p "JSON.stringify({node:process.version,uid:process.getuid(),gid:process.getgid()})"
```

Expected identity is UID/GID 1000 and Node v24.21.0. For database diagnostics, use [the CLI reference](CLI.md); commands that require a stopped application still require it to be stopped. Do not install tools into a running image. Rebuild/review a new candidate through [dependency maintenance](DEPENDENCY_MAINTENANCE.md) when changing the runtime.

Linux CI verifies initialization, native SQLite, non-root/read-only operation, signed fixtures, TLS/SSE through Caddy, process termination/restart, backup/assets/separate-root restoration, exported-image round trip and both guided installer formats. Browser checks cover existing asset/widget flows. Only exact recorded results can be called passed; see [testing](TESTING.md).

## Proxy security updates

`deploy/caddy` builds the standard Caddy 2.11.6 modules with Go 1.27.2 and x/net 0.60.0. The checked-in `go.mod`/`go.sum`, Go checksum database and immutable builder/runtime image digests bind its inputs. Go's automatic toolchain download is disabled; the build uses `-mod=readonly`. The proxy retains symbols so vulnerability review can distinguish an imported package from a module-level match. The example supports Linux amd64 and keeps zlib pinned to 1.3.2-r1.

The dependency-review CI profile scans both exact images. For the proxy, it additionally extracts the Caddy binary from the scanned image ID, runs govulncheck v1.8.0 against the official Go database and checks the Go symbol table. GO-2026-5932 concerns deprecated OpenPGP packages. Only their proven absence with a module-only finding may pass the narrow not-affected rule; the raw unknown count, binary hash and reason are still printed. A stripped binary, package/symbol finding, changed reviewed versions, an additional advisory or unavailable scan fails. This does not waive affected code or change the ordinary application image scanner.

The proxy is built locally by the host tool; it is not included in the downloadable application image archive. Preserve its image ID with the installation record. Fresh public certificate renewal remains a live acceptance scenario, separate from fixture TLS tests.

## Licenses and inventory

The image and `*-notices.tar.gz` contain `/app/THIRD_PARTY_LICENSES`: application notices and a separate `runtime` directory with the full Node license, musl copyright/source notices, GCC GPLv3 and Runtime Library Exception 3.1, provenance and exact OS package inventory. [Runtime notice provenance](../licenses/runtime/README.md) explains the upstream texts and exception. GCC package metadata is preserved verbatim rather than replaced with a friendlier license identifier.

The application notice inventory conservatively includes the locked production dependency graph and bundled notices; it is not an OS inventory or proof that every optional build dependency is distributed. The disabled image optimizer is specifically excluded and checked. [Dependency licenses](DEPENDENCIES.md) explains the development-platform reference and refresh procedure. The build fails on new OS upstream versions/packages or missing notices. Release packaging checks that both notice trees exist before export.

Maintain a manual redistribution review for the actual exported binary/native-library set. Notices copied successfully do not establish legal or security sign-off by themselves. The [release procedure](RELEASING.md) binds the completed review to one retained source/image pair; any later source or image change requires a new review.
