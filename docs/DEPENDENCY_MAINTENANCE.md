# Maintaining release dependencies

This guide is for maintainers preparing an upgrade or release. Operators choose when to update through [Updating KekBot](UPDATING.md). Start contribution work with [CONTRIBUTING](../CONTRIBUTING.md); candidate publication follows [Releasing](RELEASING.md).

## Policy

Dependency changes belong in deliberate, reviewed maintenance PRs before a candidate is frozen. KekBot does not use automated dependency PRs, automatic merges or automatic installation updates. Registry audits inform review; they do not modify packages or approve a release.

Direct application and development dependencies use exact versions, pnpm uses a frozen lockfile, and workflow actions use full commit SHAs. Node and pnpm versions must agree across the manifest, version file and Dockerfile. Node image version tags can be rebuilt upstream: acceptance therefore binds to the actual retained image ID, rather than assuming that rebuilding a tag produces identical bytes. Both Node stages share an immutable base digest. Caddy pins its build/runtime base digests and checked-in Go module graph/checksums.

The [minimal application runtime](RUNTIME_IMAGE.md) removes unused OS tools and the disabled native image optimizer. It retains the genuine installed-package database, Node license and separate OS/runtime notices. Caddy 2.11.6 is rebuilt with Go 1.27.2 and x/net 0.60.0; its zlib package remains pinned to 1.3.2-r1. Signed Alpine repository contents can change, so retain and scan exact images. New OS upstream versions or packages fail the notice gate for review. These changes do not waive affected findings.

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

The frozen first-beta candidate now has four dated dependency/license passes in the [remediation review](RELEASE_READINESS.md#beta-remediation-review). Stable/live acceptance remains pending. The two development-tool findings observed on 2026-10-08 are remediated as follows:

The earlier 2026-10-09 [beta review](RELEASE_READINESS.md#beta-dependency-review) remains a historical failed-image record. The new shell-free image removes the affected unused OS packages/optimizer; the rebuilt proxy proves the remaining OpenPGP match is absent from its binary. Review identities and raw counts are preserved, without an affected-code waiver.

| Advisory | Affected path and remedy | Evidence and removal condition |
| --- | --- | --- |
| [esbuild cross-origin development-server reads](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) | Drizzle's legacy loader selected esbuild 0.18.20. An exact parent-scoped override selects 0.25.12, already used elsewhere in this lockfile; the upstream fix starts at 0.25.0. | The actual loader dependency rejects cross-origin reads and still transforms TypeScript. Drizzle generates/checks migrations normally. Remove the override when the loader selects a fixed version itself. |
| [braces recursion exhaustion](https://github.com/micromatch/braces/issues/70) | Next's ESLint tooling uses braces 3.0.3; no fixed upstream release was available. The [checked-in patch](../patches/braces@3.0.3.patch) caps AST nesting at 100 in the shared parser, including mixed braces/parentheses. Escaped/quoted literals and ordinary glob behavior remain intact. | Regression tests exercise string aliases, malicious root globs, the depth boundary and the real Next link rule. Remove the patch and its audit treatment together when a tested upstream fix becomes available. |

**Raw `pnpm audit` still reports one high advisory for braces 3.0.3 and exits nonzero.** Registry version checks cannot identify a local code patch. `pnpm dependencies:audit` reports that count unchanged and lists the advisory under `locallyPatched` only after [verification](../scripts/dependency-patches.mjs) confirms the manifest binding, lockfile patch identity, checked-in patch checksum and installed parser checksum. It accepts only that exact version and dependency path. A missing/modified patch, another path, another advisory or an audit error fails. This is an identified code remediation, not a claim that the raw scan is clean.

The local production audit has zero findings. No production package was added, no lint rules were removed, and no blanket advisory ignore is configured. The current [dependency record](dependency-review.json) binds all four reviews, including this patch verification, to one frozen source/image. It does not pass the separate live/stable gates.
