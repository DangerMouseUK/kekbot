# Preparing and releasing KekBot

The `0.1.0-beta.2` candidate includes the merged bundled-HTTPS installer fix. Its [candidate review](RELEASE_READINESS.md#beta-2-review) must pass before publication; the [beta guide](BETA.md) and [release notes](releases/v0.1.0-beta.2.md) describe evaluation and upgrade compatibility. [Beta 1](releases/v0.1.0-beta.1.md) remains immutable. Stable acceptance requires the [live campaign](LIVE_ACCEPTANCE.md); publication requires explicit owner authorization. Preparation can run without provider accounts or local Docker.

This is the maintainer release procedure. Operators should use [installation](INSTALLATION.md), [configuration](CONFIGURATION.md) and [upgrade/recovery](BACKUP_RECOVERY.md#upgrade-and-rollback). Return to the [documentation index](README.md).

Review fixes change the candidate source even when versions/formats stay the same. Rebuild and verify the final source/image; do not transfer an earlier candidate's acceptance. The 2026-10-09 [regressions](TESTING.md#long-lived-state-and-lifecycle-regressions) cover grant races, import versions, waiting queues and privacy/cooldown boundaries. Their fixture results do not change `release-evidence.json`'s pending live or dependency gates.

<!-- contents:start -->
**On this page**

- [Release sequence](#release-sequence)
- [Beta prerelease preparation and publication](#beta-prerelease-preparation-and-publication)
- [Supported candidate versions](#supported-candidate-versions)
- [Autonomous candidate preparation](#autonomous-candidate-preparation)
- [Freeze and acceptance evidence](#freeze-and-acceptance-evidence)
- [Final publication gate](#final-publication-gate)
- [Dependency review gate](#dependency-review-gate)
<!-- contents:end -->

## Release sequence

| Stage | Required input | Result | Still not authorized by this stage |
| --- | --- | --- | --- |
| Prepare | Clean reviewed commit, ordinary CI, pinned build tools | Audited unaccepted source/image/notices/checksums | Deployment, stable acceptance, tag/registry publication |
| Accept | Frozen source/image plus actual live/reference/independent trials | Dated sign-off evidence tied to exact identities | Publishing a different rebuild or moving an existing tag |
| Publish | Complete acceptance and explicit owner authorization | Exact retained accepted artifacts and immutable version/digest | Claiming a published-install trial before it runs |
| Verify distribution | Fresh installation using the published artifacts | Final milestone evidence and supported upgrade/recovery instructions | Reusing fixture or same-host evidence for an unavailable live gate |

Before an independent installer trial, hand the operator the root README and [installation](INSTALLATION.md), not private maintainer commands. Use [first session](FIRST_SESSION.md), [provider setup](PROVIDERS.md), [OBS](OBS.md) and [recovery](BACKUP_RECOVERY.md) as the public path. Record where help was required and retest changed instructions. Editorial completeness does not itself pass O02.

## Beta prerelease preparation and publication

`v0.1.0-beta.2` uses the existing **unaccepted candidate** packaging contract. It must not use `--stable`, change the stable policy, mark fixture runs as live passes, or populate live evidence with inferred results. Its `release.json` retains `candidate-unaccepted`. Explicit installer **Specific release** selection supports prereleases; **Latest stable** never selects this beta.

Preparation checklist:

1. Align `package.json`, Docker's default version and Compose image name; preserve dependency pins and formats. Write tester-facing scope, compatibility, limitations, install/update and feedback guidance.
2. Commit/freeze the candidate. Run ordinary PR checks and the full optional campaign below on that exact SHA, including source/history/image audits, source/image installer rehearsals and application/tooling/app-image/proxy-image vulnerability reviews.
3. Inspect the actual target-platform dependency inventory/notices and obligations. Record dated reviews bound to the source/image; do not hide the raw locally patched tooling advisory. Investigate any new finding before recommending publication.
4. Download only the audited candidate artifact, verify all checksums, and retain the exact source/image/notices/metadata bundle in protected release storage beyond CI's 14-day retention. Record its source, image ID and checksums. Do not rebuild it for publication.
5. Add the exact CI/source/image outcomes to the [beta verification record](releases/v0.1.0-beta.2.md#verification-record). Keep unrun live/reference/operator checks explicit. An evidence-only follow-up commit does not change the frozen source recorded inside the bundle.

Run from the reviewed checkout with GitHub CLI:

```sh
gh workflow run ci.yml --ref <BETA_REVIEW_BRANCH> --field soak=true --field package=true --field dependencies=true
gh run view <RUN_ID> --json headSha,status,conclusion
```

Compare `headSha` with the frozen candidate. A passing dependency scan alone is not a license review or live acceptance. If a source fix is required, freeze a new commit, rebuild/retest affected checks and retain that new exact image. Never silently substitute an earlier artifact.

**Publication is a separate owner decision.** Before recommending a wider beta, complete a fresh real-provider/OBS session with restart and backup/restore, or state clearly that the beta is limited to evaluation without that evidence. The destroyed test host is not available; preparation does not provision infrastructure. No live gate is waived by using a prerelease label.

Once the owner explicitly authorizes beta publication, verify the candidate/evidence identities and assets again, create an immutable `v0.1.0-beta.2` tag at the **frozen candidate source**, and publish a GitHub **prerelease**, with latest-release promotion disabled. Attach only the retained audited assets and the final release notes. Keep the pending live limits visible. Do not publish a mutable `latest` registry tag or mark stable metadata accepted. This repository has no automatic release-publishing workflow; CI remains read-only.

After publication, update the README/index/beta guide/notes publication status together and rehearse **Specific release** installation from the actual published assets. That final download/discovery path cannot be tested against a nonexistent release. Record it separately; automated bundle fixtures do not establish an unaided installer trial. Any registry publication or additional format requires its own authorized, verified distribution work.

Maintainers can run that distribution rehearsal in Linux CI without asking testers to run Docker locally:

```sh
gh workflow run ci.yml --ref <EVIDENCE_BRANCH> --field published_release=v0.1.0-beta.2
```

Use a reviewed branch containing the `published_release` workflow input. CI resolves the actual release assets through the host tool, verifies their checksums and image identity, then rehearses image installation, source build, update failure/recovery and uninstall in isolated fixtures. It prints only the selected source/image identities and outcomes. The job does not publish, deploy live integrations, upload runtime evidence or approve an unaided installer gate. Record the published artifact identity separately from the CI helper revision; do not replace the retained release image with the helper checkout's new build.

### Host-tool corrections after publication

Published tags and assets remain immutable. A host-tool fix may manage an unchanged release from a separately reviewed, pinned tool checkout; record both identities rather than calling the published source fixed. Application updates never implicitly replace management code. The [beta 1 bundled-HTTPS workaround](INSTALLER.md#beta-1-bundled-https-installer-fix) follows this path. A future distribution containing the correction requires a new version and the normal authorized publication process.

Require `python3 -B installer/smoke.py --proxy-context` in Linux container CI: it builds from retained/staged proxy resources and adapts domain/IP configurations without requesting certificates. The local-proxy fixture lifecycle and a whole-checkout Caddy build do not establish that bundled HTTPS staging works. Preserve dependency/license sign-off against its original application source/image; a new application image needs its own review.

## Supported candidate versions

The [interactive installer](INSTALLER.md) supports repository branches, PR heads and exact commits through source builds, plus published/local audited source and Linux amd64 image bundles. Its default discovery uses GitHub's latest stable release and fails closed until stable metadata/assets exist. Host updates/removal follow [updating](UPDATING.md) and [uninstalling](UNINSTALLING.md); no releases are published by the installer.

| Component | Supported candidate |
| --- | --- |
| Node.js / pnpm | 24.21.0 / 10.26.0; exact CI pins in `.node-version` and `package.json` |
| Next.js / React | 16.3.8 / 19.3.0 |
| Production host | Linux x86-64, local persistent disk, one app replica; 2 vCPU / 2 GiB reference runtime target still unmeasured |
| Windows/macOS | Documented Docker Desktop container path; native distribution not supported |
| Application / database / backup / native config | `0.1.0-beta.2` / schema 3 / format 1 / format 1 |
| Proxy example | Caddy 2.11.6; domain or supported public-IP HTTPS; operator owns public reachability |
| Upgrade | Schemas 1 and 2 → 3 supported; future schemas rejected; unsupported downgrade prohibited |

Provider support is capability/scope-dependent. Follow/subscription variants, chat delivery identity, Discord guild permissions and YouTube availability/autoplay must be revalidated on the frozen candidate. Historical foundation results do not establish current full-product compatibility. See [provider setup](PROVIDERS.md), [OBS/media](OBS.md) and [operations](OPERATIONS.md) for limits and contacted third-party services.

## Autonomous candidate preparation

Ordinary [CI](../.github/workflows/ci.yml) builds/tests the Linux image, checks every application layer plus image metadata with checksum-pinned Gitleaks, and prepares source/image/notices archives with SHA256 checksums. It has read-only repository permissions, no provider credentials and no registry login. It creates no tag or GitHub release and deploys nothing.

For a full-duration soak and downloadable **unaccepted** candidate artifacts, dispatch the existing workflow on the review branch:

```sh
gh workflow run ci.yml --ref <REVIEW_BRANCH> --field soak=true --field package=true
```

GitHub accepts a branch or tag name for `--ref`. Verify the returned run's `headSha` with `gh run view <RUN_ID> --json headSha` and compare it with the intended full source SHA before treating the results as evidence. The checkout and candidate metadata use that captured run identity.

The soak uses isolated generated fixtures, 25 signed commands/second for one hour, a 100/second burst for one minute, five Chromium sources, backlog drainage and restart. Only allowlisted aggregate measurements enter its public step summary. It shares hosted-runner resources with its driver/browsers, so it cannot pass the PRD reference-host gates. Raw workload data, private credentials, browser traces and screenshots are never uploaded.

Use `--field soak=false --field package=true` for a packaging rehearsal alone. PR checks, ordinary manual runs and full-soak runs have separate concurrency groups, so packaging or a documentation push does not cancel an active hour-long soak. A newer run of the same profile/branch replaces its predecessor.

The optional artifact is `kekbot-candidate-<source SHA>`, retained for 14 days. It contains only audited release archives/metadata/checksums under ignored `output/release`. Artifact upload runs only after container/recovery, image-layer scanning, checksum verification and an exported-image round trip pass. That round trip loads the archive, verifies its recorded image identity, and initializes/seeds/checks a fresh volume as the non-root user with a read-only root and no network access. It is a distribution rehearsal, not an accepted release. A manually dispatched run does not replace required PR checks.

Local/source-only preparation needs a clean committed checkout and no Docker:

```sh
pnpm release:check
pnpm release:prepare --source-only
```

Full Linux image preparation, after the CI-equivalent build/tests:

```sh
docker build --build-arg VCS_REF=<FULL_SOURCE_SHA> --build-arg VERSION=<PACKAGE_VERSION> --tag kekbot:candidate .
pnpm release:prepare --image kekbot:candidate --gitleaks /path/to/verified/gitleaks
```

Use checksum-verified Gitleaks 8.30.1. Preparation rejects dirty source, incorrect image platform/user/source/version/license, unexpected baked environment names, private application-layer files and a failing secret scan. It scans files removed by later layers as well as the final application files. The only reviewed exceptions are the exact generated preview-key fields in Next's prerender manifest and its generated action encryption field when both action maps are empty. Provider/application secrets have no exception; enabling Server Actions fails the audit until key handling is reviewed. This complements source/history scanning and review; it is not a vulnerability audit or proof that every upstream package is safe.

Output is named with the application version and first twelve source-SHA characters:

- `*-source.tar.gz`: `git archive` of that committed public source, with no ignored/runtime/uncommitted files.
- `*-linux-amd64-image.tar.gz`: compressed Docker image archive; load with `docker load` after checksum verification.
- `*-notices.tar.gz`: KekBot MIT license and the image's actual target-platform third-party notices/inventory.
- `release.json`: full source SHA, application/schema/backup versions, platform, immutable Docker image ID and acceptance state.
- `SHA256SUMS`: hashes of the other files. Verify with `sha256sum --check SHA256SUMS` inside the bundle directory; PowerShell users can compare `Get-FileHash -Algorithm SHA256` with the listed hashes.

Source/dependency/toolchain pins make inputs inspectable. Image bytes are not promised identical across rebuilds: base-image tags, native compilation, build tooling and timestamps can affect them. SHA256 identifies the produced files. Record the loaded Docker image ID as well as the archive hash. A registry manifest digest is a different identity and must also be recorded when publishing. The notices archive includes application notices plus the image’s Node/musl/GCC runtime notices and real OS package inventory. Review [runtime redistribution](RUNTIME_IMAGE.md#licenses-and-inventory) on the exact image.

## Freeze and acceptance evidence

Use [release-evidence.json](release-evidence.json) as the machine-readable sign-off index. Its exact 33 gate IDs are L01–L24, P01–P07, O01 (two independent complete owner sessions) and O02 (three unaided installations). All are currently pending. `pnpm release:check` validates that pending records are honest; it does **not** report release readiness. `pnpm release:check --stable --image-digest <IMAGE_ID>` fails until all gates pass, the exact frozen source/image match, and the source has a stable v1-or-later package version.

1. Resolve implementation blockers and deliberately set the intended stable version in `package.json`, Docker defaults and Compose image naming. Keep exact pins and review license changes. Commit the candidate and run relevant CI/soak. Build/export the image once; retain that tested immutable image. Do not rebuild a different image for publication.
2. Record its full commit and Docker image ID in the candidate fields of the sign-off index. Here `imageDigest` means the Docker configuration/image ID (`docker image inspect --format '{{.Id}}'`), not a registry manifest digest or archive hash.
3. Run the actual campaign against that candidate. Each passing gate needs a UTC date and a `docs/RELEASE_READINESS.md#<explicit-anchor>` reference to sanitised public evidence. The checker validates schema, identity and references; maintainers still review whether evidence proves the scenario. Missing/failing/unavailable required scenarios remain blocking. A process kill never substitutes for physical host failure, and a same-host copy never substitutes for L22.
4. Commit sign-off documentation separately, so the frozen candidate SHA remains immutable. From that sign-off checkout, verify the frozen source with `pnpm release:check --stable --source /path/to/frozen-checkout --image-digest <IMAGE_ID>`. This avoids a self-referencing commit hash.
5. From the clean frozen checkout, `pnpm release:prepare --stable --image kekbot:candidate --gitleaks /path/to/verified/gitleaks --evidence /path/to/signoff-checkout/docs/release-evidence.json` checks the separate sign-off record and prepares acceptance-verified **unpublished** artifacts. It still has no publication side effects. Preserve exact tested artifacts and rerun affected acceptance after any implementation/image change.

Keep identifying addresses/accounts, grants, payloads, raw reports and detailed operations in protected private evidence outside the source checkout. Public evidence contains source/image identity, scenario/date/outcome and sanitised defects. Never paste private provider configuration into this index.

## Final publication gate

Publish all exact package assets under their recorded names, including `release.json` and `SHA256SUMS`; automatic GitHub source downloads alone are insufficient for the wizard. Preserve `sourceArchive`, immutable `image.imageId`, platform/schema/backup fields and accepted metadata (the packaging status remains `acceptance-verified-unpublished`, its pre-publication provenance). Only designate an actually accepted v1-or-later release as latest stable. The release's source archive contains the matching host tool/guides; review the tool before sudo. Prebuilt distribution avoids rebuilding an accepted image; source-build distribution produces a new image needing its own verification. Checksums are integrity evidence, not signed publisher authentication. Rehearse both installer formats and a published-release upgrade/removal before final distribution sign-off.

Publication is a separate owner-authorized operation. Before publishing, verify final PRD coverage, live and independent-operator evidence, supported versions, security reporting, release notes, dependency/base-image licenses, repository/history/image scans, config/support export redaction and archive checksums. Check that the intended tag/version is unused; never move an existing public release tag or silently replace its artifacts.

After explicit authorization, tag the accepted frozen source, publish that exact source and retained image to the chosen registry with an immutable version, attach checksums/notices/metadata to the GitHub release, and record source SHA and registry manifest digest. Configure Compose to use the published immutable image/digest with its existing build settings disabled for a published-artifact trial. Avoid mutable `latest` as a recovery/version reference. Publication credentials stay in the publisher's protected environment, not this repository or candidate archives.

Then complete a clean installation from actual published artifacts and rehearse the pre-upgrade backup/upgrade/recovery path. Update Milestone 19 only after those results and the definition of done pass. No release workflow can automate provider consent, independent people or missing live evidence. The current workflow prepares and audits artifacts; automatic tag/registry publication is not enabled.

## Dependency review gate

Before stable packaging, follow [dependency maintenance](DEPENDENCY_MAINTENANCE.md). [dependency-review.json](dependency-review.json) requires separate application, tooling, image and license passes bound to the exact frozen source/image. Read the current record for each outcome; a pass never transfers to a new source/image. They supplement the existing live acceptance gates; a clean build or production-only audit cannot approve the candidate.

`pnpm release:check --stable --source /path/to/frozen-candidate --image-digest IMAGE_ID` fails closed on missing/mismatched reviews. For private external evidence, `--dependency-review PATH` selects the dependency record; its default is `dependency-review.json` beside the `--evidence` file. Stable `release:prepare` uses that sibling record. Record sign-off in a separate evidence revision referring to the frozen candidate. Do not publish raw audit output, private diagnostic logs or runtime files.
