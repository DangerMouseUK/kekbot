# Maintaining release dependencies

This guide is for maintainers preparing an upgrade or release. Operators choose when to update through [Updating KekBot](UPDATING.md). Start contribution work with [CONTRIBUTING](../CONTRIBUTING.md); candidate publication follows [Releasing](RELEASING.md).

## Policy

Dependency changes belong in deliberate, reviewed maintenance PRs before a candidate is frozen. KekBot does not use automated dependency PRs, automatic merges or automatic installation updates. Registry audits inform review; they do not modify packages or approve a release.

Direct application and development dependencies use exact versions, pnpm uses a frozen lockfile, and workflow actions use full commit SHAs. Node and pnpm versions must agree across the manifest, version file and Dockerfile. Node image version tags can be rebuilt upstream: acceptance therefore binds to the actual retained image ID, rather than assuming that rebuilding a tag produces identical bytes. Caddy's separate build also pins its base digest and downloaded binary checksum.

From the checkout root, with the pinned Node/pnpm toolchain:

```sh
pnpm install --frozen-lockfile
pnpm dependencies:check
```

The second command is offline. It validates pins and the review-record structure, **not vulnerability status or acceptance**. Ordinary CI also audits production npm dependencies.

## Make a maintenance PR

1. Select compatible upstream versions intentionally. Read release/security notes, Node/native SQLite compatibility and any migration or browser changes. Do not run blanket audit fixes or add unexplained overrides.
2. Update exact versions and the lockfile together. Review additions/removals, licenses and notices; runtime notices still follow [Dependencies](DEPENDENCIES.md).
3. Run `pnpm check`, `pnpm build`, `pnpm test:standalone` and `pnpm test:e2e`. Require the Linux container/proxy/storage/installer checks for the resulting source. Add focused regression tests for changed behavior.
4. Prepare a new candidate and repeat the affected acceptance checks. Never carry a dependency sign-off over to different source or image bytes.

Normal maintenance targets main. An urgent security patch may target an affected supported stable release instead, using the same review and identity rules below.

## Review a candidate

From the candidate checkout, `pnpm dependencies:review` audits both production dependencies and the full development/tooling tree. It prints aggregate counts only. It returns nonzero for findings, unavailable/malformed audit responses or a missing image scan. It never installs updates or changes evidence records.

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

Confirm the run's head SHA. The container job scans the same packaged application image and pinned Caddy image after its normal checks, using a checksum-verified Trivy binary. Its console contains counts, not raw vulnerability reports. It does not approve, publish or deploy anything. This profile has its own concurrency group. A finding makes the optional job fail and must be investigated.

## Record sign-off

[dependency-review.json](dependency-review.json) has four independent reviews: application packages, tooling packages, image packages, and licenses/notices. All start pending. Each pass needs a real date and a local evidence anchor, bound to the frozen 40-character source SHA and `sha256:` image ID. Record sign-off in a separate evidence revision so recording it does not change the candidate under review.

An unavailable check blocks sign-off. Fix exploitable runtime or release-pipeline vulnerabilities before acceptance. Any residual finding needs explicit maintainer approval with the affected version, exposure analysis, mitigation and review deadline in the referenced evidence. A nonzero scan is not a clean scan; production-only results, blanket exclusions and unexplained waivers do not satisfy tooling/image review. Review licenses manually as well as checking the generated runtime notice inventory.

`pnpm release:check --stable --source /path/to/frozen-candidate --image-digest IMAGE_ID` requires these four passes and the existing live-acceptance gates. `--dependency-review PATH` selects an external record; by default it uses `dependency-review.json` beside the selected `release-evidence.json`. Stable packaging uses that sibling record. Unaccepted development bundles remain possible; a successful bundle build does not waive these requirements.

## Security patches

Before the first stable release, there is no supported stable version. Afterward, the latest accepted stable release is the default supported line unless maintainers explicitly document additional lines. Prepare an urgent patch from the affected stable source, update only the necessary dependencies and related compatibility changes, rerun relevant checks and approve a new source/image pair. Publish a new patch version; never move an existing release tag or replace its archives. Operators still choose when to install it.

<a id="review-record"></a>
## Current review record

No frozen candidate has dependency sign-off. The local 2026-10-08 production npm audit was clean; the full audit reported two development-tool advisories: esbuild via drizzle-kit ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) and braces via the Next ESLint tooling ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). These remain unresolved review items. No exception or dependency upgrade is implied by adding this policy. A fresh full image review and license sign-off are still required for a release.
