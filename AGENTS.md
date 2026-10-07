# Repository instructions

## Working style

Work as a single agent. Do not delegate or spawn subagents without the user's explicit approval for the current task. Inspect relevant code, tests and documentation before changing them. Prefer targeted changes and the pinned pnpm toolchain. Do not commit, push, deploy, provision paid infrastructure or publish a release unless the user has authorised that action.

## Architecture and safety

- Keep routes and React components separate from domain services, provider clients, storage and background jobs. All control surfaces use the same domain decisions.
- Use real SQLite transactions, constraints and optimistic versions for durable state. Keep provider calls outside transactions. Treat uncertain outbound delivery as requiring reconciliation; never retry it blindly.
- Enforce current permissions at every server entry point and again when deferred work executes. Widget read access and player acknowledgements have different credentials.
- Default to isolated synthetic fixtures for development and CI. Tests must not use live grants, send real provider mutations or load live YouTube playback. Generate fixture keys and credentials at runtime.
- Add schema changes through checked-in SQL migrations and metadata. Do not edit released migrations or regenerate them at startup. Preserve backup compatibility or document an explicit upgrade boundary.
- Avoid new production dependencies unless necessary. Pin any added dependency exactly and review its license and use.

## Documentation and evidence

The root README is the public entry point. Keep it, CONTRIBUTING.md, operator/API/testing guidance, CHANGELOG.md and milestone/roadmap evidence consistent with changed behaviour. Update both PRDs together only when requirements change. Link new public guides from the appropriate index. Examples use reserved domains, synthetic identities and empty provider credentials.

Keep planned, implemented, fixture-tested and live-tested evidence distinct. Record exact commands and source/candidate identity. CI timings are not reference-host benchmark results. Real OBS/provider checks, certificate renewal and independent-owner trials require live evidence. Never mark an unavailable scenario passed.

## Verification and publication

Run `pnpm check` and relevant targeted tests. For runtime/UI/package changes, run `pnpm build`, `pnpm test:standalone` and `pnpm test:e2e`. Linux container, proxy and storage-fault checks run in GitHub Actions; see [testing guidance](docs/TESTING.md). Do not ask the user to run local tests that the agent or CI can run.

Before publishing, inspect the complete candidate and scan publication files and Git history with redacted output. No environment files, private keys, tokens, runtime data, raw live history, screenshots/traces, operator setup records, personal filesystem paths or installation addresses belong in Git or image build contexts. Keep private evidence outside the checkout; do not upload browser traces or fixture data as public CI artifacts. Follow SECURITY.md for reporting.

Report what changed, which checks passed and what remains unverified. A successful build or route alone does not establish release acceptance.
