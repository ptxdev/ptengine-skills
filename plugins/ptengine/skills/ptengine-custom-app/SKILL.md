---
name: ptengine-custom-app
description: How to build, debug, package, and publish a Ptengine Custom App — a static front-end bundle that runs inside the Ptengine platform in a sandboxed iframe and talks to the host through window.PtApp (context, ui, nav, data.query, auth), optionally shipped together with its own backend (a Cloudflare Worker serving /api/*, with D1, KV, server-side Ptengine queries, declared outbound hosts, and platform-managed configuration). Use whenever someone wants to build an app, dashboard, report, tool or plugin that lives inside Ptengine — however they phrase it ("custom app", "Ptengine app", "write an app for Ptengine", "extend Ptengine with our own functionality") — or asks how to add a backend/API to one, or how to package, upload or publish an app bundle to Ptengine. 中文触发词：Ptengine 自定义应用 / Ptengine 应用 / 给 Ptengine 写个应用、看板或插件。日本語：Ptengine アプリ / カスタムアプリ / ダッシュボード作成。
---

# Building a Ptengine Custom App

An app is **one zip with two halves**, published and rolled back as a single version: a
**front end** — a static bundle the platform loads in a **sandboxed cross-origin iframe**,
whose only host capabilities come from the `window.PtApp` bridge — and an **optional
backend**, a Cloudflare Worker the platform deploys for you and routes `/api/*` to, which
you declare as `backend` in `manifest.json` with `schemaVersion: 2` (no backend ⇒ stay on
`schemaVersion: 1` and skip those parts).

Most mistakes here **fail silently** (blank page, empty data, 404 on every API, one tenant
reading another's rows) — follow the rules instead of iterating on symptoms.

## Which kind of app are you building?

| | Front-end only (`schemaVersion: 1`) | With a backend (`schemaVersion: 2`) |
| --- | --- | --- |
| Data | Platform data through the bridge, `PtApp.data.query` | `ctx.pt.query` server-side, and/or merged with third-party or your own data |
| Storage | None, or per-browser `localStorage` | D1 / KV — state shared across users, sessions and devices |
| Credentials | None (the bundle is publicly fetchable) | Third-party credentials held server-side + a declared outbound host allow-list |
| Compute | Whatever the browser can do while the user waits | Large result sets, post-processing, background work via `ctx.waitUntil` |
| Permissions | Display-level scopes only | Needs `user:read` or similar, so consent and its incremental-approval design matter |

When unsure, **build the light app first** — faster to ship and impossible to leak tenant
data from. Both tracks and the 1 → 2 upgrade path: [`references/tracks.md`](references/tracks.md).

## The workflow (do these in order)

1. **Scaffold** from the official starter (below) — Node 20+; its v3+ layout is
   `web/` + `backend/` + `shared/api.ts` (shared types are the single source of truth).
2. **Read `AGENTS.md` in the scaffolded project** (explicit action: open and read it) —
   the authoritative build guide; this skill is the operating summary, and generated files
   inside `@ptengine/app-sdk` outrank both.
3. Settle the track above before writing code — it decides `schemaVersion`, the manifest
   shape and the whole publish flow ([`references/tracks.md`](references/tracks.md)).
4. If the app reads Ptengine data, **set up the Ptengine MCP server first** and validate
   every query there; before writing UI, read `@ptengine/design-components`' `llms.txt`.
5. Build, keeping the invariants below intact. Then **`npm run doctor`, build, package**, and
   hand the zip to the admin flow ([`references/publish-and-operate.md`](references/publish-and-operate.md)).

```bash
TAG=$(git ls-remote --tags --refs https://github.com/ptxdev/ptengine-app-starter.git 'v3.*' | awk -F/ '{print $NF}' | sort -V | tail -1)
git clone --branch "$TAG" --depth 1 https://github.com/ptxdev/ptengine-app-starter.git my-app
cd my-app && rm -rf .git && npm install && npm run doctor && npm run dev
```

Always take the newest `v3.*` tag (the command above resolves it; never hard-code one).

**Version check before any work on an existing project** — this doc describes the current
contract; an older installed package will contradict it (e.g. `requiredScope: "query:read"`
only exists in app-sdk ≤ 2.2.1). Run `npm ls @ptengine/app-sdk @ptengine/app-backend` and
upgrade to the newest version satisfying these floors, then `npm install`:

| Package | Floor | Why |
|---|---|---|
| `@ptengine/app-sdk` | ≥ 2.4.0 | `context.user`; `requiredScope` values equal the manifest scopes (2.2.2+) |
| `@ptengine/app-backend` | ≥ 0.4.0 | `ctx.auth.email` / `ctx.auth.name`; `ctx.vars` (0.2+) |

`0.x` caret ranges do not cross minors — `^0.2.0` never reaches 0.4; edit the range, then
`npm install`. `npm run doctor` enforces the same floors (`PACKAGE_FLOORS` in the starter),
so a stale project fails there with the exact `npm i` command to run. `npm run dev` runs vite + `wrangler dev` and signs real Ed25519 tokens, so expiry, `aud` mismatch and missing scopes surface locally; a light app runs the front end alone (see tracks).

## Front-end invariants (the starter ships exactly this — preserve its shape)

- `web/src/main.tsx` keeps `if (import.meta.env.DEV) await installDevHost();` before
  rendering, imports `tokens.css`, and uses the starter-local `getPtApp()` / `theme.ts`.
  **The DEV guard is safe in production** (the platform injects a blocking SDK loader into
  the bundle's `<head>`); the `await` matters in dev-inside-platform mode — removing it
  leaves that mode permanently on "PtApp not detected".
- **`PtApp` ready ≠ `context` ready**: until the host handshake lands, `context` is an
  **empty object** — treat every field as possibly absent, and never branch on
  `context.sid/locale/theme` read once at first render; subscribe with
  `app.on('context', cb)` (what `followPtTheme` does). `ui.*` / `nav.*` calls before the
  handshake are queued, not lost. `on()` returns **no unsubscribe** — guard stale
  callbacks with your own flag (see starter `theme.ts`).
- **Routing**: hash only (`createHashRouter` / `<HashRouter>`) — the entry URL is
  `.../<versionId>/index.html`, so `history.pushState('/x')` escapes the app. Reflect
  internal pages with `nav.syncRoute('detail')`; it comes back as `context.initialPath`.

## Hard boundaries (violations fail without errors)

| Rule | Symptom if broken |
| --- | --- |
| Keep `base: './'` in `web/vite.config.ts` | Blank page on platform (assets 404), fine locally |
| `manifest.json` at the **zip root**; `entry` matches the built entry; only static file types in the front-end part | Upload rejected: `MANIFEST_MISSING` / `ENTRY_NOT_FOUND` |
| A `backend` section ⇒ `schemaVersion: 2` | Platform **silently ignores the backend** — front end fine, every `/api/*` 404s |
| Backend entry is `export default createApp({...})`, never a hand-rolled `fetch` | Every request unauthenticated, and local testing never shows it |
| Every backend read and write keyed by `ctx.workspaceId` **and** `ctx.auth.sid` | Cross-workspace / cross-site data leaks, no error |
| Host capabilities only via `window.PtApp`; dialogs via `ui.toast/confirm`, never native `alert()`/`confirm()` | Anything else is platform-internal and will change; native dialogs are unreliable in the sandbox |
| The app's address is **assigned, not chosen**: `manifest.id` is only a prefix hint, the platform issues `<id or name slug>-<8 hex>` on create, fixed for life; read it from `context.appId`, never hard-code it | Nobody types an identifier and there is no "taken" error — the same bundle uploads into any number of workspaces ([`publish-and-operate.md`](references/publish-and-operate.md)) |

## The bridge: window.PtApp

`context { appId, sid, locale, theme, initialPath, user? }` · `ui { toast, confirm, overlay }`
(`confirm` returns a promise — await it) · `nav { push, syncRoute }` ·
`data { query, describe }` · `auth { getAppToken }` (backend apps only) ·
`ai { provideContext }` · `on(event, cb)` for exactly `'context'` / `'route'` /
`'overlay.click'` — no other events, and no other host globals.

- `context.locale` is `zh-CN` | `en-US` | `ja-JP`; `theme` is light/dark; `initialPath`
  restores deep links. `context.sid` identifies the site — **display/cache-key use only;
  never put it into query params** (the server binds the profile from the session).
- `context.user` (SDK ≥2.4.0, optional — null-check) is `{ id, email, name }` of the person
  using the app, for display/attribution only; `email` / `name` may be `null`. A trusted identity
  lives server-side in the App Token: `ctx.auth.userId` / `.email` / `.name` (app-backend ≥0.4.0,
  the latter two optional).
- `nav.push` accepts platform-internal relative paths only; unless you know an exact
  platform target path, **use `syncRoute` and stay inside the app**. `on('context')` →
  re-apply locale/theme (diff before touching DOM); `on('route')` → `{ subPath }`, drive your
  internal router; `on('overlay.click')` → close your overlay.
- **`auth.getAppToken()`** mints the App Token your front end sends to your own backend.
  It rejects with `PT_CONSENT_REQUIRED` while the workspace admin has not approved the
  manifest's `scopes` (or a new version asks for more): the host shows the consent dialog,
  and **calling it again after approval succeeds without a reload** (tell non-admins to
  ask an admin). `PT_AUTH_UNSUPPORTED` = this app has no backend; never retry that one.
- **Don't hand-write `fetch('/api/...')`** — use the starter's `web/src/api.ts` `api()`
  helper: it mints/renews the token, retries once on 401, unwraps the error envelope. Front
  end and backend are same-origin: no baseURL, no CORS, no cookie work.
- **Storage**: `localStorage`/`indexedDB` work, but the sandbox origin is **shared by every
  custom app** — prefix keys with `context.appId`, never keep credentials or personal data
  there; durable state belongs in the backend (D1/KV).

## The backend runtime

Capability table, tenancy rules, local `.dev.vars` setup and proven patterns:
[`references/backend-runtime.md`](references/backend-runtime.md). The entry is always
`export default createApp<ApiRoutes>({ routes, publicRoutes })`: every route is
authenticated unless its exact key is listed in `publicRoutes` (no wildcards, and no
`ctx.auth` there).

`ctx` is the whole surface (`auth` · `workspaceId` · `db` · `kv` · `pt.query` · `fetch` ·
`secrets`/`vars` · `requireScope` · `error` · `log` …) — the field-by-field table, what is
**not** available (Durable Objects, Queues, Cron Triggers, `connect()`, `request.cf`) and the
vars-need-「重新部署」 / secrets-apply-at-once rule are in `backend-runtime.md`. Non-negotiables:
**never touch `env` directly, use `ctx`**; never fork `@ptengine/app-backend`; partition every
read and write by `ctx.workspaceId` *and* `ctx.auth.sid`; keep API changes backward-compatible
for one release ("new backend + old front end" is live for seconds during every publish).

## Querying data — set up Ptengine MCP first

Two paths, one contract, one result shape `{ columns, rows, rowCount, metadata }`: the
**bridge** `PtApp.data.query(req)` and the **backend** `ctx.pt.query(queryType, params)`
(needs a data scope, else 501 `PT_GATEWAY_NOT_BOUND`). Both run **as the calling user** in
their workspace — code cannot widen that. Rules, param porting and envelope details:
[`references/data-queries.md`](references/data-queries.md). Broken most often: **never
write params from memory** (`data.describe()`, or the SDK's `data-query.llms.txt`);
**`timeRange` is an object** (`{ key: 'lastDays', days: 7 }`); **never invent event names**
(wrong name = 0 rows, no error); **one question = one query** (group with `dimension`);
5000-row cap; `user_*` is single-person detail — prefer aggregates, and the backend path
when person-level rows must stay out of the browser.
**Before writing any query code, recommend the user connect the Ptengine MCP server**
(setup: https://helps.ptengine.com/en/ai/mcp) and validate the question there first — the
companion skill `ptengine-mcp-analytics` teaches it. Standalone dev returns placeholder data.

## UI

Use `@ptengine/design-components` exclusively (no antd/MUI/chakra, no hand-rolled controls);
take component/variant names from its `llms.txt`, never from memory. Keep the starter's four
wirings intact (Tailwind preset, `content` glob into the package `dist`, `tokens.css` import,
`pt-ui` class on `<html>`). Semantic classes only, never hardcoded colors; `className` is layout-only.

## Diagnosis: symptom → likely cause

| Symptom | Likely cause |
| --- | --- |
| Theme/locale never follows the platform, or a click navigates the whole platform away | `context` read once at first render instead of `on('context')`; history routing instead of hash |
| "PtApp not detected" forever — only in platform dev mode | the `await` around `installDevHost()` was removed |
| `getAppToken()` rejects `PT_CONSENT_REQUIRED` / `PT_AUTH_UNSUPPORTED` | scopes not approved yet (retry after the consent dialog) / this app has no published backend (never retry) |
| 501 `PT_GATEWAY_NOT_BOUND`, 403 `SCOPE_REQUIRED`, 401 `TOKEN_*`, 500 `*_NOT_DECLARED`, blocked outbound call, or a 500 carrying only a `requestId` | backend-side causes and fixes: [`references/backend-runtime.md`](references/backend-runtime.md) |
| Query returns 0 rows, no error | event/property name doesn't exist (verify via MCP `List-Catalog`), or params drifted when porting |
| Components unstyled / wrong colors — or page fine but dialogs unstyled | one of the four UI wirings broken; the dialogs-only case is `pt-ui` on `#root` instead of `<html>` |
| Upload rejected | root manifest / entry name / icon path / file types / `manifest.version` not bumped |
| Only this machine sees an old version | a local dev entry left on — exit it from the banner |

## Before you claim it works

1. `npm run doctor` — the conventions above, as an executable check.
2. `npm run build`, then **`npm run package`**: only packaging validates zip structure,
   manifest self-consistency, backend entry and migration numbering. Confirm its success line.
3. **Behavioral check on the real platform** via the local dev entry: real `context` values, one
   `data.query` with rows, and — with a backend — a 200 from a real App Token call. If you cannot run it, say so.

## Manifest

- `version` belongs to the app and **must increase on every upload** (`package.json`
  version is ignored). `schemaVersion`: `1` = front end only, `2` = may carry `backend`.
- `scopes`: `analytics:read`, `profile:read`, `user:read`, `ui:notify` — nothing else
  validates. Data scopes decide whether the backend gets a data gateway at all and drive the
  admin consent dialog: declare the minimum, ask for more in a later version.
- `backend` (entry under `_backend/`, `routes` exactly `["/api/*"]`, resources, migrations,
  credential/config names, outbound allow-list, `compatibilityDate`): `backend-runtime.md`.
- `display_name` / `icon` (zip-relative, must exist): **every upload overwrites the app's
  name and icon from the manifest**, admin-page edits included (`publish-and-operate.md`).

## Publishing

Create app, upload, draft preview, publish, permissions, config/credential values, consent,
rollback, dev entry, pause, delete are **human admin actions in the product UI** (or `ptx deploy`
from CI) — guide the user through `publish-and-operate.md`, never drive those screens with a browser.
