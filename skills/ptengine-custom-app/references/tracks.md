# Two tracks: light app and backend app

The starter ships the full thing (front end + backend). Which track you are on decides
how much of it you keep, what you have to read, and what shipping costs later.

## Light track — front end only (`schemaVersion: 1`)

The right default. The app renders in the iframe, reads platform data through
`PtApp.data.query`, keeps nothing durable of its own, and ships as a static bundle.

**You do not need to read `backend-runtime.md` or `data-queries.md`'s backend half.**
Everything you need is `SKILL.md` plus the starter's `AGENTS.md`.

Turning the scaffold into a light app — four edits, all verified against the current
starter (v3):

1. **Delete `backend/`.**
2. **Edit the root `tsconfig.json`** and remove the `{ "path": "./backend" }` project
   reference. **Required**: `ptx build` runs `tsc -b` over the root project and dies with
   `TS5083: Cannot read file .../backend/tsconfig.json` if the reference is left behind.
   This is the one edit people miss.
3. **Edit `manifest.json`**: drop the whole `backend` section and set
   `"schemaVersion": 1`. Keep only the scopes the front end actually uses (a read-only
   dashboard is usually `analytics:read` plus `ui:notify`).
4. Optional tidy-up: drop `@ptengine/app-backend` from `package.json`. `web/src/api.ts`
   and `shared/api.ts` can stay (they still type-check, and they cost nothing), but delete
   both if the app never calls an API of its own — keeping a dead API client is how a
   "light" app quietly grows a backend later.

What the tooling then does — measured, not assumed:

| Command | Behaviour without `backend/` |
| --- | --- |
| `npm run doctor` | **Passes unchanged**, reporting "no backend section (static app)" and skipping the local-config checks. No flag, no edit needed |
| `npm run build` | Fails until edit 2 is done; afterwards builds the front end and prints that it skipped the backend |
| `npm run package` | Works; the zip carries the front end and `manifest.json` only |
| `npm run dev` | **Fails** — it looks for the backend's wrangler config and exits (`ENOENT … backend/wrangler.jsonc`). There is no switch |

So a light app's local loop is the plain vite server: run `npx vite` from `web/`
(http://localhost:5173). `installDevHost()` still installs the mock host, and pointing the
platform's local dev entry at that URL still gives you the real host and real data.

Ship when `npm run doctor` is clean and `npm run package` prints its success line.

## Backend track (`schemaVersion: 2`)

Keep the scaffold as it is and follow `SKILL.md` end to end, plus:

- [`backend-runtime.md`](backend-runtime.md) — `ctx`, tenancy invariants, manifest
  `backend` section, local `.dev.vars`, proven patterns, what the runtime does not have.
- [`data-queries.md`](data-queries.md) — the two query paths and their rules.
- [`publish-and-operate.md`](publish-and-operate.md) — the publish pipeline, configuration
  and credential values, consent, rollback.

Budget for it honestly: multi-tenant partitioning on every read and write, migrations you
can never take back, values an admin has to fill in before the first publish succeeds, and
a consent dialog in front of your users.

## Upgrading a light app to a backend (1 → 2)

Nothing is lost — the front end is untouched — but the cost is real, so do it when a
requirement forces it, not in anticipation.

1. Restore the `backend/` directory from the starter (same version you scaffolded from),
   re-add the root `tsconfig.json` project reference, and re-add `@ptengine/app-backend`.
2. Write `shared/api.ts` first: routes, params, body and response types are the contract
   both halves compile against.
3. Add the `backend` section to `manifest.json` and set `"schemaVersion": 2`. Declare
   only the resources you use, and the credential/config names, and the outbound hosts.
   **Declaring `backend` while leaving `schemaVersion: 1` is silently ignored** — front
   end fine, every `/api/*` 404.
4. Add any new scope in the same version, bump `manifest.version`, package, upload, fill
   in the required values, publish.
5. Switch the front end to the `api()` helper (it mints the App Token, renews it, retries
   once on 401) and handle `PT_CONSENT_REQUIRED` with a retry after the consent dialog.

What it costs from then on:

- **A new scope needs approval again.** Every workspace sees the consent dialog on first
  entry after that version, and a non-admin cannot approve it.
- **A rollback to the narrower version leaves the scoped routes returning 403
  `SCOPE_REQUIRED`** while everything else keeps working — that is the desired shape, and
  it only happens if `ctx.requireScope()` sits on the individual routes that read platform
  data rather than at the entry point.
- **Migrations are forward-only.** A rollback restores code, never schema, so every
  migration must be safe to leave in place when the previous version runs again.
- Publishing gets slower and more fragile: resources, migrations, bindings, worker deploy
  and a health probe, versus copying static files.
