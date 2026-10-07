# Preparing and releasing KekBot

The current `0.1.0-dev.0` build is an unreleased candidate. The [requirements audit](RELEASE_READINESS.md) and [live acceptance campaign](LIVE_ACCEPTANCE.md) define the remaining work. Preparation can run without provider accounts or a local Docker installation. Stable sign-off requires the live results; publication requires the repository owner's explicit authorization.

## Supported candidate versions

| Component | Supported candidate |
| --- | --- |
| Node.js / pnpm | 24.21.0 / 10.26.0; exact CI pins in `.node-version` and `package.json` |
| Next.js / React | 16.3.8 / 19.3.0 |
| Production host | Linux x86-64, local persistent disk, one app replica; 2 vCPU / 2 GiB reference runtime target still unmeasured |
| Windows/macOS | Documented Docker Desktop container path; native distribution not supported |
| Application / database / backup / native config | `0.1.0-dev.0` / schema 2 / format 1 / format 1 |
| Proxy example | Caddy 2.11.6; domain or supported public-IP HTTPS; operator owns public reachability |
| Upgrade | Foundation schema 1 → 2 supported; future schemas rejected; unsupported downgrade prohibited |

Provider support is capability/scope-dependent. Follow/subscription variants, chat delivery identity, Discord guild permissions and YouTube availability/autoplay must be revalidated on the frozen candidate. Historical foundation results do not establish current full-product compatibility. See [OPERATIONS.md](OPERATIONS.md) for limits and declarations of contacted third-party services.

## Autonomous candidate preparation

Ordinary [CI](../.github/workflows/ci.yml) builds/tests the Linux image, checks every application layer plus image metadata with checksum-pinned Gitleaks, and prepares source/image/notices archives with SHA256 checksums. It has read-only repository permissions, no provider credentials and no registry login. It creates no tag or GitHub release and deploys nothing.

For a full-duration soak and downloadable **unaccepted** candidate artifacts, dispatch the existing workflow against an exact review commit:

```sh
gh workflow run ci.yml --ref <BRANCH_OR_COMMIT> --field soak=true --field package=true
```

The soak uses isolated generated fixtures, 25 signed commands/second for one hour, a 100/second burst for one minute, five Chromium sources, backlog drainage and restart. Only allowlisted aggregate measurements enter its public step summary. It shares hosted-runner resources with its driver/browsers, so it cannot pass the PRD reference-host gates. Raw workload data, private credentials, browser traces and screenshots are never uploaded.

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

Use checksum-verified Gitleaks 8.30.1. Preparation rejects dirty source, incorrect image platform/user/source/version/license, unexpected baked environment names, private application-layer files and a failing secret scan. It scans files removed by later layers as well as the final application files. This complements source/history scanning and review; it is not a vulnerability audit or proof that every upstream package is safe.

Output is named with the application version and first twelve source-SHA characters:

- `*-source.tar.gz`: `git archive` of that committed public source, with no ignored/runtime/uncommitted files.
- `*-linux-amd64-image.tar.gz`: compressed Docker image archive; load with `docker load` after checksum verification.
- `*-notices.tar.gz`: KekBot MIT license and the image's actual target-platform third-party notices/inventory.
- `release.json`: full source SHA, application/schema/backup versions, platform, immutable Docker image ID and acceptance state.
- `SHA256SUMS`: hashes of the other files. Verify with `sha256sum --check SHA256SUMS` inside the bundle directory; PowerShell users can compare `Get-FileHash -Algorithm SHA256` with the listed hashes.

Source/dependency/toolchain pins make inputs inspectable. Image bytes are not promised identical across rebuilds: base-image tags, native compilation, build tooling and timestamps can affect them. SHA256 identifies the produced files. Record the loaded Docker image ID as well as the archive hash. A registry manifest digest is a different identity and must also be recorded when publishing. OS/Node base-image licenses remain in the image; the separate notices archive inventories application dependencies.

## Freeze and acceptance evidence

Use [release-evidence.json](release-evidence.json) as the machine-readable sign-off index. Its exact 33 gate IDs are L01–L24, P01–P07, O01 (two independent complete owner sessions) and O02 (three unaided installations). All are currently pending. `pnpm release:check` validates that pending records are honest; it does **not** report release readiness. `pnpm release:check --stable --image-digest <IMAGE_ID>` fails until all gates pass, the exact frozen source/image match, and the source has a stable v1-or-later package version.

1. Resolve implementation blockers and deliberately set the intended stable version in `package.json`, Docker defaults and Compose image naming. Keep exact pins and review license changes. Commit the candidate and run relevant CI/soak. Build/export the image once; retain that tested immutable image. Do not rebuild a different image for publication.
2. Record its full commit and Docker image ID in the candidate fields of the sign-off index. Here `imageDigest` means the Docker configuration/image ID (`docker image inspect --format '{{.Id}}'`), not a registry manifest digest or archive hash.
3. Run the actual campaign against that candidate. Each passing gate needs a UTC date and a `docs/RELEASE_READINESS.md#<explicit-anchor>` reference to sanitised public evidence. The checker validates schema, identity and references; maintainers still review whether evidence proves the scenario. Missing/failing/unavailable required scenarios remain blocking. A process kill never substitutes for physical host failure, and a same-host copy never substitutes for L22.
4. Commit sign-off documentation separately, so the frozen candidate SHA remains immutable. From that sign-off checkout, verify the frozen source with `pnpm release:check --stable --source /path/to/frozen-checkout --image-digest <IMAGE_ID>`. This avoids a self-referencing commit hash.
5. From the clean frozen checkout, `pnpm release:prepare --stable --image kekbot:candidate --gitleaks /path/to/verified/gitleaks --evidence /path/to/signoff-checkout/docs/release-evidence.json` checks the separate sign-off record and prepares acceptance-verified **unpublished** artifacts. It still has no publication side effects. Preserve exact tested artifacts and rerun affected acceptance after any implementation/image change.

Keep identifying addresses/accounts, grants, payloads, raw reports and detailed operations in protected private evidence outside the source checkout. Public evidence contains source/image identity, scenario/date/outcome and sanitised defects. Never paste private provider configuration into this index.

## Final publication gate

Publication is a separate owner-authorized operation. Before publishing, verify final PRD coverage, live and independent-operator evidence, supported versions, security reporting, release notes, dependency/base-image licenses, repository/history/image scans, config/support export redaction and archive checksums. Check that the intended tag/version is unused; never move an existing public release tag or silently replace its artifacts.

After explicit authorization, tag the accepted frozen source, publish that exact source and retained image to the chosen registry with an immutable version, attach checksums/notices/metadata to the GitHub release, and record source SHA and registry manifest digest. Configure Compose to use the published immutable image/digest with its existing build settings disabled for a published-artifact trial. Avoid mutable `latest` as a recovery/version reference. Publication credentials stay in the publisher's protected environment, not this repository or candidate archives.

Then complete a clean installation from actual published artifacts and rehearse the pre-upgrade backup/upgrade/recovery path. Update Milestone 19 only after those results and the definition of done pass. No release workflow can automate provider consent, independent people or missing live evidence. The current workflow prepares and audits artifacts; automatic tag/registry publication is not enabled.
