# Two tracks: light app and backend app

The starter ships the full thing (front end + backend). Which track you are on decides
how much of it you keep, what you have to read, and what shipping costs later.

## Light track — front end only (`schemaVersion: 1`)

The right default. The app renders in the iframe, reads platform data through
`PtApp.data.query`, keeps nothing durable of its own, and ships as a static bundle.

**You do not need to read `backend-runtime.md` or `data-queries.md`'s backend half.**
Everything you need is `SKILL.md` plus the starter's `AGENTS.md`.

Turning the scaffold into a light app — two edits on **starter v3.2.0 or newer**:

1. **Delete `backend/`.**
2. **Edit `manifest.json`**: drop the whole `backend` section and set
   `"schemaVersion": 1`. Keep only the scopes the front end actually uses (a read-only
   dashboard is usually `analytics:read` plus `ui:notify`).

Optional tidy-up: drop `@ptengine/app-backend` from `package.json`. `web/src/api.ts` and
`shared/api.ts` can stay (they still type-check and cost nothing), but delete both if the
app never calls an API of its own — a dead API client is how a "light" app quietly grows a
backend later.

From v3.2.0 the tooling branches on whether `manifest.json` has a `backend` section, so a
light app needs no further changes:

| Command | Behaviour with no `backend` section |
| --- | --- |
| `npm run doctor` | Passes, reporting "no backend section (static app)" and skipping the local-config checks |
| `npm run dev` | Starts the front end only (no wrangler, no token signing) |
| `npm run build` | Type-checks and builds the front end, skipping the backend |
| `npm run package` | Zips the front end plus `manifest.json` |

Ship when `npm run doctor` is clean and `npm run package` prints its success line.

### Using v3.0.0 – v3.1.x?

Every starter release before v3.2.0 still assumes a backend in two places — both
**verified by running it**, and both fixed from v3.2.0:

- `npm run build` fails with `TS5083: Cannot read file .../backend/tsconfig.json` until you
  also remove the `{ "path": "./backend" }` project reference from the root
  `tsconfig.json`. This is the edit people miss; `doctor` and `package` are unaffected and
  pass as-is.
- `npm run dev` exits with `ENOENT … backend/wrangler.jsonc` and has no switch. Run the
  front end directly instead: `npx vite` from `web/` (http://localhost:5173).
  `installDevHost()` still installs the mock host, and pointing the platform's local dev
  entry at that URL still gives you the real host and real data.

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

1. Restore the `backend/` directory from the starter (same version you scaffolded from)
   and re-add `@ptengine/app-backend` (before v3.2.0, also re-add the
   `{ "path": "./backend" }` project reference to the root `tsconfig.json`).
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
