# Production dependency licenses

This is the generated application dependency reference. See [supplemental notices](../licenses/README.md) for reviewed upstream license fallbacks, [release packaging](RELEASING.md) for distributed notices, and the [documentation index](README.md) for operator/contributor guides.

Generated from the installed, locked production dependency tree with `pnpm licenses list --prod --json` on 2026-10-07. Includes direct and transitive packages. Package metadata paths and author contact details are intentionally omitted. Each package retains its own license; redistributed container dependencies retain their bundled notices. Refresh this inventory whenever the lockfile changes.

KekBot source and its built-in CSS themes are MIT licensed. User-uploaded assets remain the operator’s responsibility. There are no bundled third-party images, fonts or sounds.

`pnpm build` also copies license/notice files from the actual target-platform production dependency graph (including bundled notices) to ignored `output/licenses`. Images include these under `/app/THIRD_PARTY_LICENSES` with a name/version/license index. Platform-conditional native packages can differ from this development inventory; their installed notices and licenses remain authoritative.

Builds fail if an installed production package has no notice or reviewed version-matched fallback. [Supplemental upstream notices](../licenses/README.md) cover packages whose locked npm tarballs omit license text. The candidate package includes the image's notice tree and checks its inventory before export. Node/Debian base-image notices remain in the image; this table inventories application packages rather than the OS.

## Refresh and redistribution review

The host lifecycle wizard uses Python 3.10+ standard library only; no pip packages are installed or bundled and no Python runtime is added to the application image. Operators supply Python/Git/Docker on the host. The source bundle includes the MIT-licensed host tool and tests; application dependency/license inventories below remain the locked npm tree. See [installer prerequisites](INSTALLER.md#before-you-start).

After changing the lockfile, install with the frozen lockfile, run `pnpm licenses list --prod --json` privately, and update the package/version/license rows below without copying local paths or author contacts. Run `pnpm build` to verify notice extraction; Linux container CI checks the target-platform notice inventory and exported package. Do not replace a missing license with a guessed identifier: inspect the exact upstream version and add a reviewed fallback only when justified.

Keep the upstream legal text under `licenses/` unchanged. Generated image notices, native-library version inventories and any corresponding-source obligations still need final redistribution review. A successful notice-copy script does not by itself settle every dependency's legal requirements. [Release procedure](RELEASING.md) describes the distribution gate.

## Locked application inventory

| Package | Locked versions | License |
| --- | --- | --- |
| @babel/code-frame | 7.29.7 | MIT |
| @babel/compat-data | 7.29.7 | MIT |
| @babel/core | 7.29.7 | MIT |
| @babel/generator | 7.29.8 | MIT |
| @babel/helper-compilation-targets | 7.29.7 | MIT |
| @babel/helper-globals | 7.29.7 | MIT |
| @babel/helper-module-imports | 7.29.7 | MIT |
| @babel/helper-module-transforms | 7.29.7 | MIT |
| @babel/helper-string-parser | 7.29.7 | MIT |
| @babel/helper-validator-identifier | 7.29.7 | MIT |
| @babel/helper-validator-option | 7.29.7 | MIT |
| @babel/helpers | 7.29.7 | MIT |
| @babel/parser | 7.29.9 | MIT |
| @babel/template | 7.29.7 | MIT |
| @babel/traverse | 7.29.8 | MIT |
| @babel/types | 7.29.8 | MIT |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later |
| @jridgewell/gen-mapping | 0.3.13 | MIT |
| @jridgewell/remapping | 2.3.5 | MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @next/env | 16.3.8 | MIT |
| @next/swc-win32-x64-msvc | 16.3.8 | MIT |
| @playwright/test | 1.63.0 | Apache-2.0 |
| @swc/helpers | 0.5.23 | Apache-2.0 |
| @types/better-sqlite3 | 9.6.0 | MIT |
| @types/node | 24.19.0 | MIT |
| baseline-browser-mapping | 2.11.27 | Apache-2.0 |
| better-sqlite3 | 13.0.3 | MIT |
| browserslist | 4.29.3 | MIT |
| caniuse-lite | 1.0.30001814 | CC-BY-4.0 |
| client-only | 0.0.1 | MIT |
| convert-source-map | 2.0.0 | MIT |
| debug | 4.4.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| drizzle-orm | 0.45.3 | Apache-2.0 |
| electron-to-chromium | 1.5.443 | ISC |
| escalade | 3.2.0 | MIT |
| gensync | 1.0.0-beta.2 | MIT |
| js-tokens | 4.0.0 | MIT |
| jsesc | 3.1.0 | MIT |
| json5 | 2.2.3 | MIT |
| lru-cache | 5.1.1 | ISC |
| ms | 2.1.3 | MIT |
| nanoid | 3.3.19 | MIT |
| next | 16.3.8 | MIT |
| node-addon-api | 8.9.2 | MIT |
| node-releases | 2.0.57 | MIT |
| picocolors | 1.1.1 | ISC |
| playwright | 1.63.0 | Apache-2.0 |
| playwright-core | 1.63.0 | Apache-2.0 |
| postcss | 8.5.23 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| scheduler | 0.28.0 | MIT |
| semver | 6.3.1, 7.8.5 | ISC |
| sharp | 0.35.5 | Apache-2.0 |
| source-map-js | 1.2.2 | BSD-3-Clause |
| styled-jsx | 5.1.6 | MIT |
| tslib | 2.8.1 | 0BSD |
| undici-types | 7.24.6 | MIT |
| update-browserslist-db | 1.3.3 | MIT |
| yallist | 3.1.1 | ISC |
| zod | 4.6.5 | MIT |
