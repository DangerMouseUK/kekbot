# Supplemental upstream notices

Some locked npm packages omit license files from their published tarballs. Builds copy their upstream notices alongside the package inventory and fail if any installed production package has no notice or reviewed fallback. Keep upstream text unchanged.

- Drizzle ORM `0.45.3`: [Apache-2.0 license at the release commit](https://github.com/drizzle-team/drizzle-orm/blob/15454dbe49d827c6081f3d0231e2e7985e517295/LICENSE), copied to [drizzle-orm-0.45.3/LICENSE](drizzle-orm-0.45.3/LICENSE). No source modifications are included.
- `@next/env` / `@next/swc-*` `16.3.8` and `client-only` `0.0.1`: the installed Next.js `license.md` supplies the upstream Vercel MIT notice, also available at the [Next.js release commit](https://github.com/vercel/next.js/blob/b0fad0d45eb4c4430fda5eeeb442e8a5af08a5f6/license.md).
- `@img/sharp-libvips-*` `1.3.4`: [upstream third-party notices](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/THIRD-PARTY-NOTICES.md) and the Apache-2.0 **packaging-script** license are retained separately in [sharp-libvips-1.3.4](sharp-libvips-1.3.4/README.md). The native library remains LGPL-3.0-or-later with additional upstream library licenses. GNU LGPLv3/GPLv3 texts, the installed package's licensing README and its exact native-library version inventory accompany these notices.

The generator also preserves bundled third-party notices it finds. These notices cover redistributed dependencies; they do not change KekBot's MIT license. Review this mapping and the target-platform inventory when updating packages. No build-time license download is needed.
