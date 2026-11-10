# Maintaining release dependencies

**Maintainer reference:** this is the process for changing software dependencies. Installing or updating your bot does not require following this audit procedure; use [the operator update guide](UPDATING.md).

This guide is for maintainers preparing an upgrade or release. Operators choose when to update through [Updating KekBot](UPDATING.md). Start contribution work with [CONTRIBUTING](../CONTRIBUTING.md); candidate publication follows [Releasing](RELEASING.md).

## Policy

Dependency changes belong in deliberate, reviewed maintenance PRs before a candidate is frozen. KekBot does not use automated dependency PRs, automatic merges or automatic installation updates. Registry audits inform review; they do not modify packages or approve a release.

Direct application and development dependencies use exact versions, pnpm uses a frozen lockfile, and workflow actions use full commit SHAs. Node and pnpm versions must agree across the manifest, version file and Dockerfile. Node image version tags can be rebuilt upstream: acceptance therefore binds to the actual retained image ID, rather than assuming that rebuilding a tag produces identical bytes. Both Node stages share an immutable base digest. Caddy pins its build/runtime base digests and checked-in Go module graph/checksums.

The [minimal application runtime](RUNTIME_IMAGE.md) removes unused OS tools and the disabled native image optimizer. It retains the genuine installed-package database, Node license and separate OS/runtime notices. Caddy 2.11.6 is rebuilt with Go 1.27.2 and x/net 0.60.0; its zlib package is pinned to 1.4-r0 (the Alpine 3.23 security update that replaced 1.3.2-r1). Signed Alpine repository contents can change, so retain and scan exact images. New OS upstream versions or packages fail the notice gate for review. These changes do not waive affected findings.

From the checkout root, with the pinned Node/pnpm toolchain:

```sh
pnpm install --frozen-lockfile
pnpm dependencies:check
```

The second command is offline. It validates pins and the review-record structure, **not vulnerability status or acceptance**. Ordinary CI runs `pnpm dependencies:audit` against both production and development dependencies. That networked check retains registry counts and verifies any exact local remediation described below.

## Make a maintenance PR

1. Select compatible upstream versions intentionally. Read release/security notes, Node/native SQLite compatibility and any migration or browser changes. Do not run blanket audit fixes or add unexplained overrides.
2. Update exact versions and the lockfile together. Review additions/removals, licenses and notices; runtime notices still follow [Dependencies](DEPENDENCIES.md). A necessary transitive override must be exact and scoped to its parent. A local patch needs checked-in source, exploit/compatibility regressions, a removal condition and an explicitly verified audit treatment; never exclude an advisory globally.
3. Run `pnpm check`, `pnpm build`, `pnpm test:standalone` and `pnpm test:e2e`. Require the Linux container/proxy/storage/installer checks for the resulting source. Add focused regression tests for changed behavior.
4. Prepare a new candidate and repeat the affected acceptance checks. Never carry a dependency sign-off over to different source or image bytes.

Normal maintenance targets main. An urgent security patch may target an affected supported stable release instead, using the same review and identity rules below.

## Review a candidate

From the candidate checkout, `pnpm dependencies:audit` audits production dependencies and the full development/tooling tree. `pnpm dependencies:review` adds the image check. Both print aggregate counts and identifiers of verified local remediations, without raw provider responses or paths. Optional `--image-findings` adds at most 200 allowlisted advisory IDs/package versions/severities/statuses, sorted by severity, with an omitted count; it never prints raw scanner titles, targets, paths or URLs. All findings still count and block the application check, including omitted rows. The proxy has one narrowly verified not-affected rule described below. Unresolved findings and unavailable/malformed responses return nonzero; the complete review also fails on a missing image scan. Neither command installs updates or changes evidence records.

For the image check, use a trusted local **Trivy 0.75.0** executable, verified against the checksum in its [official release](https://github.com/aquasecurity/trivy/releases/tag/v0.75.0). On the Linux build host, save the already-tested candidate image into private storage and run:

```sh
docker save --output /private/candidate-image.tar kekbot:candidate
pnpm dependencies:review --scanner /private/tools/trivy --image-archive /private/candidate-image.tar
```

Replace the example paths and image name with your private paths and actual candidate. This reads an archive without starting the application. Registry and vulnerability-database access are required; network/scanner failure is not a pass. Repeat the image scan for the pinned Caddy image when included in the installation, and record its image ID in the review evidence as well. The output includes the scanned image ID. Keep the archive and detailed investigation outside Git and public artifacts.

Alternatively, maintainers can request the optional Linux CI review from a branch containing the updated workflow:

```sh
gh workflow run ci.yml --ref REVIEW_BRANCH --field dependencies=true
```

Confirm the run's head SHA. The container job scans the same packaged application image and pinned Caddy image after its normal checks, using a checksum-verified Trivy binary. Its console contains counts and bounded allowlisted advisory metadata using `--image-findings`, not raw vulnerability reports. It does not approve, publish or deploy anything. This profile has its own concurrency group. A finding makes the optional job fail and prevents the candidate artifact upload; investigate rather than bypassing the review to obtain assets.

## Record sign-off

[dependency-review.json](dependency-review.json) has four independent reviews: application packages, tooling packages, image packages, and licenses/notices. All start pending. Each pass needs a real date and a local evidence anchor, bound to the frozen 40-character source SHA and `sha256:` image ID. Record sign-off in a separate evidence revision so recording it does not change the candidate under review.

The proxy review additionally uses checksum-verified Go 1.27.2 and Go checksum-database-verified govulncheck v1.8.0. `scripts/proxy-review.mjs` extracts `/usr/bin/caddy` from the exact Trivy-scanned image ID and checks the unstripped symbol table and the official Go vulnerability database. Only GO-2026-5932 for x/crypto v0.57.0 may be classified not affected: its deprecated OpenPGP packages must be absent, with only a module-level finding. No package/symbol finding or additional advisory can pass. Missing symbols, changed modules/toolchain, mismatched images and malformed/unavailable scans fail closed. The raw unknown count remains visible alongside the binary SHA256 and reason. This is a verified absence of vulnerable code, not an affected-version waiver. `dependencies:review` itself continues to fail on every raw image finding.

An unavailable check blocks sign-off. Fix exploitable runtime or release-pipeline vulnerabilities before acceptance. Any residual finding needs explicit maintainer approval with the affected version, exposure analysis, mitigation and review deadline in the referenced evidence. A nonzero scan is not a clean scan; production-only results, blanket exclusions and unexplained waivers do not satisfy tooling/image review. Review licenses manually as well as checking the generated runtime notice inventory.

`pnpm release:check --stable --source /path/to/frozen-candidate --image-digest IMAGE_ID` requires these four passes and the existing live-acceptance gates. `--dependency-review PATH` selects an external record; by default it uses `dependency-review.json` beside the selected `release-evidence.json`. Stable packaging uses that sibling record. Unaccepted development bundles remain possible; a successful bundle build does not waive these requirements.

## Security patches

Before the first stable release, there is no supported stable version. Afterward, the latest accepted stable release is the default supported line unless maintainers explicitly document additional lines. Prepare an urgent patch from the affected stable source, update only the necessary dependencies and related compatibility changes, rerun relevant checks and approve a new source/image pair. Publish a new patch version; never move an existing release tag or replace its archives. Operators still choose when to install it.

<a id="review-record"></a>
## Current review record

<a id="node-24-22-1"></a>
### Node.js 24.22.1 toolchain — 2026-11-10

This maintenance moves the pinned Node.js toolchain and runtime from 24.21.0 to 24.22.1. The pin changes together in `.node-version`, `package.json` `engines.node`, both Dockerfile stages, the image's `NODE_VERSION`, the runtime-notice version gate and the current guides. No application code, package, lockfile, schema, backup or configuration format changes.

- **Selection.** [24.22.1](https://github.com/nodejs/node/releases/tag/v24.22.1) (2026-10-20) is a Node 24 LTS security release. It fixes HTTP agent, DNS, TLS IP-normalization, permission-model, crypto snapshot and Brotli decoder advisories, and updates OpenSSL to 3.5.9, undici to 7.30.1, c-ares to 1.34.9 and root certificates to NSS 3.131.1. It also carries the semver-minor [24.22.0](https://github.com/nodejs/node/releases/tag/v24.22.0) (2026-10-14) additions, which KekBot does not use. It is the current Node 24 LTS installer, and the 24.21.0 notice gate rejected it with `unreviewed_node_runtime`. No newer 24.x release existed on 2026-11-10.
- **Native compatibility.** `NODE_MODULE_VERSION` stays 137, so the better-sqlite3 binding ABI is unchanged. The standalone and browser checks exercise it on the new runtime.
- **Lower bound.** `engines.node` is `>=24.22.1 <25`. The dependency policy deliberately requires the lower bound to equal the exact pin, so contributors on 24.21.0 must update.
- **Image digest.** Both stages use `node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`. The OCI index was resolved anonymously from the Docker Hub registry (`registry-1.docker.io`, `library/node`), and the SHA-256 of the returned index body was recomputed to match the registry's content digest. The same query still returns the previous pin `sha256:ebfe2f90…c1c1` for 24.21.0. The index lists linux/amd64 (`sha256:1200d815…1420`), linux/arm64/v8 and linux/s390x images with attestations. The base Alpine release moves from 3.24.2 to 3.24.3.
- **Node license.** `/usr/local/LICENSE` was extracted from the verified amd64 Node layer of both images. Both files are 157,609 bytes with SHA-256 `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace`, byte-identical. The musl and GCC notices and their checksums are unchanged. The runtime closure is still installed from signed Alpine repositories and gated by the [notice script](../scripts/runtime-notices.mjs).

This is **not** a candidate review. [dependency-review.json](dependency-review.json) still binds beta 4, whose image ships Node 24.21.0; the exposure of beta 4 to the Node 24.22.1 advisories was not assessed here. The next candidate needs its own image scan and four reviews.

<a id="maintenance-2026-11-10"></a>
### Upstream drift maintenance — 2026-11-10

On 2026-11-10 ordinary CI started failing on unchanged source. `pnpm dependencies:audit` reported new registry advisories against exact pins. Separately, the proxy build failed with `apk` exit 5 because Alpine 3.23 had replaced `zlib-1.3.2-r1` with the security update `zlib-1.4-r0`. This maintenance changes only dependency pins, the lockfile, the proxy package pin and the matching notices and guides. No application code, schema, backup or configuration format changes.

It is **not** a candidate review. [dependency-review.json](dependency-review.json) still binds beta 4's frozen source/image. The next candidate needs its own four reviews, including exact application and proxy image scans.

| Package | Change | Advisories | Selection and removal condition |
| --- | --- | --- | --- |
| `next` (production) | 16.3.8 → 16.4.5 | Fixed in 16.4.1: [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) (critical, Image Optimization with SVG), [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) (critical, `use cache` returning typed arrays), [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) (high, Server Actions DoS). Fixed in 16.4.5: seven moderate Next.js repository advisories published 2026-11-03 that the npm audit feed did not yet list, including GHSA-pc58-hwjq-p385 (forwarded fetched responses behind an HTTP/1.1 proxy) and GHSA-7qx7-33qx-rqx2 (optimizer SVG rejection bypass). | 16.4.5 is the newest release whose changes are all security fixes or reviewed backports. 16.4.6 was deliberately not selected because it contains no security fix and automatically compresses route-handler responses (vercel/next.js#101280), an unreviewed behavior change for SSE and widget streams. React stays 19.3.0. `eslint-config-next` moves with it to 16.4.5. |
| `zod` (production) | 4.6.5 → 4.6.6 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (high, memory exhaustion from oversized constrained collections) | 4.6.6 checks array, set and map size bounds before parsing elements (colinhacks/zod#6652) and corrects record type members. 4.6.7 differs only in its version string. |
| `vite` (development, Vitest peer) | 8.3.2 → 8.3.6, now an exact direct devDependency | Fixed in 8.3.3: [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (high), GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22 and GHSA-vfpm-58rq-9qcg (moderate), GHSA-9jrq-w75r-8gcw (low) | Vitest declares Vite as a peer, which pnpm had auto-installed. Overrides do not apply to auto-installed peers, so the project now selects the peer explicitly with an exact pin. 8.3.6 also rejects `.wasm` outside `server.fs` and escapes server HTML attributes. Vite is not part of the application runtime. |
| `minimatch` (development) | 10.2.6 → 11.0.5 through the exact override `@typescript-eslint/typescript-estree@8.71.0>minimatch` | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (moderate, glob-part amplification), fixed only in 11.0.1 | The newest typescript-estree (8.72.2) still requests `^10.2.2`, and no 10.x fix exists. The parent calls only `minimatch(path, pattern, { dot: true })` for `allowDefaultProject`, which 11.x keeps; the APIs removed in 11.0 (`makeRe`, `Minimatch#regexp`, `AST`) are unused. 11.0.2–11.0.5 add further bounds on the same expansion. This adds `@isaacs/nonrecursive-glob-match` 1.1.0 (BlueOak-1.0.0, development only). Remove the override when typescript-estree selects a fixed minimatch itself. |
| Proxy `zlib` (Alpine 3.23 package) | 1.3.2-r1 → 1.4-r0 | CVE-2026-4738 (Alpine `secfixes`) | Alpine aports commit `0436c6d6` ("security upgrade to 1.4") reached the signed 3.23 repository on 2026-11-06, and the older package is no longer offered. The Caddy binary is static Go with CGO disabled; zlib serves the base image's tools. |

Other lockfile changes follow these selections: `@next/env` and `@next/swc-*` move to 16.4.5, `nanoid` to 3.3.20, and development-only Rolldown, `@oxc-project/types` and Vite's PostCSS refresh within existing ranges. Production PostCSS stays 8.5.23. Sharp stays 0.35.5, already the version GHSA-2464-fhr4-w9xw names as fixed, and remains excluded from standalone output and the image. Next's `license.md` is byte-identical at the v16.4.5 tag, so the reviewed `@next/*` notice fallback moves to that version. The [license inventory](DEPENDENCIES.md) was regenerated. Raw production and full-tooling audits now report zero findings.

Next 16.4 also writes its build-generated draft-mode preview keys to a separate `.next/server/preview-props.json`, which duplicates the `preview` object already in `prerender-manifest.json`. The image Gitleaks audit flagged the two key lines. The [image audit](../scripts/image-audit.mjs) now accepts that file only when it holds exactly the three preview fields with values identical to the prerender manifest. Regression tests reject extra keys, differing values, other paths, other rules and a missing manifest. KekBot does not use draft mode. Provider and application secrets still have no exception.

The braces advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) was withdrawn upstream on 2026-10-23, and the registry no longer reports it. There is still no fixed braces release, so the local patch, its regressions and its exact verifier stay unchanged; `locallyPatched` is now empty because there is nothing to match. Removing the patch is a separate decision.

#### Published beta 4 exposure

Beta 4 pins the affected `next` 16.3.8 and `zod` 4.6.5. Nothing here was live-tested or exploit-tested against a published installation. The assessment below separates what the beta 4 source shows from what relies on advisory text.

- **Image Optimization RCE and SVG bypass: not reachable in the shipped configuration (verified in source).** `next.config.ts` sets `images: { unoptimized: true }`. In Next 16.3.8's `next-server.js`, that setting makes `/_next/image` render a 404 before parameter validation or the optimizer runs. The build also rejects Sharp/libvips in standalone output. The advisory describes glibc Linux, and the runtime image is musl-based.
- **`use cache` RCE and the 16.4.5 cache advisories: preconditions absent (verified in source).** `src` contains no `"use cache"` directive or `unstable_cache` call, and `cacheComponents` is not enabled.
- **Server Actions DoS: preconditions absent (source verified, protection inferred).** `src` contains no `"use server"` directive. The advisory states that applications without Server Actions are not vulnerable; this was not tested independently.
- **Other 16.4.5 moderates: preconditions not found (source verified).** No route handler returns a fetched upstream response, and no route uses the Edge runtime.
- **Zod memory exhaustion: limited (inferred).** Unauthenticated Kick and Discord callbacks are capped at 64 KiB and verified against provider signatures before Zod parses them. Other public entries either use small bounded bodies or accept no arrays. The signed-in `/api/control` route accepts bodies up to 12 MiB, so a signed-in account might cause elevated memory use with an oversized invalid array. This was not measured.
- **Development-only Vite and minimatch findings** affect contributor tooling, not the application image.

No change to `SECURITY.md` is needed. It already routes dependency handling through this record, and no reachable unauthenticated path was identified. Beta 4 operators get the fixed versions only through a newly reviewed candidate; published releases stay immutable.

### Earlier remediations

The frozen beta 2 source/image passed its own [candidate review](RELEASE_READINESS.md#beta-2-review), including actual binary/notices inspection. The [beta 1 remediation review](RELEASE_READINESS.md#beta-remediation-review) preserves its four historical passes separately. Stable/live acceptance remains pending. The two development-tool findings observed on 2026-10-08 are remediated as follows:

The earlier 2026-10-09 [beta review](RELEASE_READINESS.md#beta-dependency-review) remains a historical failed-image record. The new shell-free image removes the affected unused OS packages/optimizer; the rebuilt proxy proves the remaining OpenPGP match is absent from its binary. Review identities and raw counts are preserved, without an affected-code waiver.

| Advisory | Affected path and remedy | Evidence and removal condition |
| --- | --- | --- |
| [esbuild cross-origin development-server reads](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) | Drizzle's legacy loader selected esbuild 0.18.20. An exact parent-scoped override selects 0.25.12, already used elsewhere in this lockfile; the upstream fix starts at 0.25.0. | The actual loader dependency rejects cross-origin reads and still transforms TypeScript. Drizzle generates/checks migrations normally. Remove the override when the loader selects a fixed version itself. |
| [braces recursion exhaustion](https://github.com/micromatch/braces/issues/70) | Next's ESLint tooling uses braces 3.0.3; no fixed upstream release was available. The [checked-in patch](../patches/braces@3.0.3.patch) caps AST nesting at 100 in the shared parser, including mixed braces/parentheses. Escaped/quoted literals and ordinary glob behavior remain intact. | Regression tests exercise string aliases, malicious root globs, the depth boundary and the real Next link rule. Remove the patch and its audit treatment together when a tested upstream fix becomes available. |

**Until the advisory's withdrawal on 2026-10-23, raw `pnpm audit` reported one high advisory for braces 3.0.3 and exited nonzero.** Registry version checks cannot identify a local code patch. `pnpm dependencies:audit` reports that count unchanged and lists the advisory under `locallyPatched` only after [verification](../scripts/dependency-patches.mjs) confirms the manifest binding, lockfile patch identity, checked-in patch checksum and installed parser checksum. It accepts only that exact version and dependency path. A missing/modified patch, another path, another advisory or an audit error fails. This is an identified code remediation, not a claim that the raw scan is clean.

The local production audit has zero findings. No production package was added, no lint rules were removed, and no blanket advisory ignore is configured. The current [dependency record](dependency-review.json) binds all four reviews, including this patch verification, to one frozen source/image. It does not pass the separate live/stable gates.
