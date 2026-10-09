# The Custom App backend runtime

A backend is **one Cloudflare Worker the platform deploys for you**. You never own a
Cloudflare account, never write deployment config for production, and never wire your own
authentication: you export one `createApp()` and the platform runtime does the rest.

```ts
// backend/src/index.ts
import { createApp } from '@ptengine/app-backend';
import type { ApiRoutes } from '../../shared/api';

export default createApp<ApiRoutes>({
    routes: {
        'GET /public/status': ctx => ({ ok: true }),
        'GET /orders/:id':    async ctx => { /* ctx.params.id */ },
        'POST /orders':       async ctx => { /* ctx.body */ }
    },
    publicRoutes: ['GET /public/status'],
    onError: (err, { requestId, route }) => undefined   // optional; undefined = default envelope
});
```

What the runtime guarantees, so you must not re-implement it:

- **Every request is authenticated** (EdDSA App Token, JWKS with kid cache and clock
  skew, `aud` bound to this app) unless the route key is listed verbatim in
  `publicRoutes`. `ctx.auth` therefore has no "unverified" state.
- **Undeclared routes 404** before authentication, so paths never leak by error shape.
- **Errors become one envelope**: `{ error: { code, message, requestId } }`. Throw
  `ctx.error(status, code)` for a controlled response; anything else becomes a 500 whose
  stack goes to the logs only.
- **A built-in probe at `/api/__health`** (unauthenticated, returns identity only) — the
  platform calls it after deploy and rolls back automatically if it fails. Declaring your
  own `/__health` route throws at startup.
- Route keys are `'METHOD /path'` with `:params`; **never include the `/api` prefix** (the
  runtime strips it) — a key that does is rejected at startup. Matching is
  **first-declared-wins** among same-length paths, so put `GET /orders/new` before
  `GET /orders/:id`.

## ctx — the whole surface

| Field | Notes |
| --- | --- |
| `ctx.auth` | `{ userId, sid, workspaceId, scopes }`, verified and frozen. **Throws on a public route** — use `ctx.authOrNull` there |
| `ctx.workspaceId` | The workspace **this call came from**. Not `ctx.app.workspaceId` (that is who owns the app; identical for every installer of an official app) |
| `ctx.scopes` | Approved scopes, read-only. Use for "do a bit more if present"; use `ctx.requireScope(...)` to enforce (403 `SCOPE_REQUIRED`; 401 on a public route) |
| `ctx.app` | `{ appId, workspaceId, versionId, env }` — `env` is `production` / `staging` / `development` |
| `ctx.params` / `ctx.query` / `ctx.body` / `ctx.request` | `query` values are **always strings** — no implicit conversion; `Number(ctx.query.days ?? '7')` yourself. A non-JSON content type lands in `body` as text; bad JSON is a 400 `BODY_INVALID_JSON` |
| `ctx.db` | D1. Needs `backend.resources.database: true`, else 500 `RESOURCE_NOT_DECLARED` |
| `ctx.kv` | KV. Needs `backend.resources.kv: true`. Minimum `expirationTtl` is 60s |
| `ctx.files` | R2, keys auto-prefixed per app. Needs `backend.resources.files: true`, which is **rejected for customer apps** (`RESOURCE_NOT_ALLOWED`) — official apps only, and its prefixing is a runtime convention, not a platform-enforced boundary, so add `${ctx.workspaceId}/` to keys yourself |
| `ctx.pt.query(queryType, params)` | Server-side Ptengine query — see [`data-queries.md`](data-queries.md). `ctx.pt.describe()` is not open yet (501) |
| `ctx.pt.asset.*` | Write into the workspace asset library. Needs `asset:write` in `manifest.scopes` **and** an admin's approval. Four calls: `ensureFolder` / `create` / `update` / `uploadSource` — see [Writing to the asset library](#writing-to-the-asset-library-assetwrite) |
| `ctx.pt.ai.*` | Call an LLM. Needs `ai:invoke` in `manifest.scopes` **and** an admin's approval. Two calls: `chat` (complete result) / `stream` (SSE `Response`) — see [Calling an LLM](#calling-an-llm-aiinvoke) |
| `ctx.fetch(url, init)` | Outbound with a 10s default `timeoutMs` and structured logging; a caller-supplied `signal` still works. Whether a host is reachable is decided by the manifest's outbound allow-list, not by this call |
| `ctx.secrets.X` / `ctx.vars.X` | Only names declared in the manifest resolve; anything else throws `SECRET_NOT_DECLARED` / `VAR_NOT_DECLARED` instead of yielding `undefined`. `PT_`-prefixed names are reserved and always refused. An empty string is a legitimate value. Secrets are references — a new value applies at once. Vars are baked into the worker at deploy time — after editing a var on the admin config page click **重新部署** (redeploy current version) to apply it; no new version upload is needed |
| `ctx.requireScope(...)`, `ctx.error(status, code, detail)`, `ctx.log(msg, fields)`, `ctx.waitUntil(p)` | `detail` goes to logs only, never into the response. `ctx.log` emits one JSON line carrying `requestId` / `appId` / `versionId` / `route` / `userId` / `sid` |

**Use `ctx`, never `env`.** The production `env` is assembled by the platform and does not
match your local `wrangler.jsonc`; `ctx` is the stable contract and enforces the boundaries.

## Multi-tenancy: the invariant that fails silently

Resources are created **per app, not per installer**. An official app installed by several
workspaces shares one D1, one KV and one bucket. Inside a workspace there are also several
sites. So:

- Every row carries **both** `ctx.workspaceId` and `ctx.auth.sid`, and every `SELECT`,
  `UPDATE`, `DELETE` filters on **both**: `WHERE workspace_id = ? AND site_id = ?`.
- Every KV key goes through **one key factory** that prefixes workspace and site (escape
  `:` inside the parts so an id cannot break the key structure). Never concatenate keys ad
  hoc; one forgotten prefix is a cross-tenant read, and nothing errors.
- `ctx.app.workspaceId` is **never** a partition key.
- Public routes have no identity at all — never read or write tenant data there.

## Manifest `backend` section

```json
{
  "schemaVersion": 2,
  "version": "1.1.0",
  "entry": "index.html",
  "scopes": ["analytics:read", "ui:notify"],
  "backend": {
    "entry": "_backend/worker.js",
    "routes": ["/api/*"],
    "resources": { "database": true, "kv": true, "files": false },
    "migrations": "_backend/migrations",
    "egress": ["api.example.com", "*.example.net"],
    "compatibilityDate": "2026-09-01"
  }
}
```

- `entry` must sit **under `_backend/`** (anywhere else publishes your server source into
  public hosting) and `routes` must be exactly `["/api/*"]`.
- **Declared credential names** (`backend.secrets`) and **declared config names**
  (`backend.vars`): names only, values are filled in on the admin page. Names match
  `^[A-Z][A-Z0-9_]*$`, cannot start with `PT_`, cannot collide with a binding name the
  runtime already uses (`DB`, `KV`, `FILES`, `PT_GATEWAY`), and the two lists share one
  namespace so a name may not appear in both. Max 64 each. A plain string entry means
  **required**; only an explicit `"required": false` makes it optional — a missing
  required value blocks publishing (`SECRET_NOT_SET` / `CONFIG_NOT_SET`).
- **Credential vs config is a semantic line, not a security boundary.** Credential values
  live in a secret store, are never readable back, and take effect **immediately**. Config
  values live in the product database, are readable, and are **baked into the worker at
  publish time — changing one requires republishing**. Never put a credential in the
  config list (its value is readable and appears in plain worker configuration), and never
  put a hot switch in it (you would have to republish to flip it).
- `egress` is the outbound host allow-list: hostnames only, no scheme/port/path, `*.` for
  exactly one label, max 32, and platform-owned or loopback hosts are rejected (read
  platform data via `ctx.pt.query`). **Omitted or empty means no outbound at all.**
- `compatibilityDate` has a platform floor; older runtimes cannot verify App Tokens.
- Migrations live under `_backend/`, numbered `NNNN_description.sql` with **no gaps**
  (packaging checks this). They are **forward-only**: a version rollback rolls back code,
  never schema. Never edit an already-published migration file — add a new one — and write
  every statement so re-running it is safe (`CREATE TABLE IF NOT EXISTS`, …).

## Local development

`npm run dev` runs vite and `wrangler dev` together, with local D1/KV in miniflare, and
generates a throwaway Ed25519 key pair so **the local auth path is the real one** — the
public half lands in `backend/.dev.vars`, the private half signs tokens from the dev
endpoint. Expiry, `aud` mismatch and missing scopes therefore fail locally, the way they
would in production.

- `backend/.dev.vars` holds **both** declared credential values and config values, one
  `NAME=value` per line. `ptx dev` creates the file and only rewrites its own `PT_`-managed
  lines; your lines are preserved. Restart `npm run dev` after editing it. It is
  git-ignored — keep it that way.
- Simulate another site or fewer scopes by editing the dev key file's `sid` / `scopes` and
  restarting. This is how you test a rollback to a version with fewer scopes.
- Apply migrations locally with `wrangler d1 migrations apply <local db> --local` from
  `backend/`.
- `backend/wrangler.jsonc` exists **only for local dev**; bindings you add there do not
  exist in production. What production has is decided by the manifest.
- `npm run doctor` cross-checks the manifest against `.dev.vars` and reports a declared
  name with no local value, or a local value with no declaration.

## Patterns that have been proven end to end

- **One public status route** (`GET /public/status` in `publicRoutes`) that probes each
  resource independently and reports `ok` / `unavailable` / `error` per item, returning
  only self-identifying information. Pass resources in as **getters**, not values —
  `ctx.db` and `ctx.kv` are lazy getters that throw when undeclared, and an eagerly
  evaluated object literal moves that throw outside your try block, turning a graceful
  self-check into a 500.
- **Scope granularity per route**: call `ctx.requireScope(...)` only on the routes that
  actually read platform data. Routes that only read rows you already stored keep working
  after a rollback to a version without that scope — degraded functionality instead of a
  dead app. Authentication still applies to all of them.
- **In-flight lock + idempotency**: for expensive generation work, take a KV lock under
  the tenant-scoped key, return a 409 with your own code while it is held, and release it
  only if you still own it. Honour an `Idempotency-Key` header by storing the result id
  under a tenant-scoped key **plus a fingerprint of the request** — the same key with
  different parameters must not return the previous result.
- **`ctx.waitUntil` for after-the-response work**: audit rows, counters, and optional LLM
  enrichment. Anything in there must not be required for the response to be correct, and
  its failures must be logged rather than thrown away.
- **Cache the expensive thing, not the request**: key caches by the tenant plus the real
  inputs (user, absolute date range, model version), and keep a `force` path that bypasses
  a cache hit but still respects the in-flight lock.
- **D1 has a 100 bind-parameter limit per statement** — batch id lists at ~90 and keep one
  statement per batch rather than falling back to N+1 queries.
- **Exports without object storage**: customer apps cannot use `ctx.files`, so render the
  document in the worker and return it inline (`Content-Disposition: attachment`, both
  `filename` and `filename*` for non-ASCII names) instead of writing a file somewhere.
- **Normalize two data sources into one internal shape** immediately (gateway query vs a
  result the front end already fetched through the bridge), then share every downstream
  line of code. Validate anything the browser posted: allow-list columns, cap rows.

## Calling the Ptengine Open API

Open API (`https://<env-backend>/open-api/v1/*`, docs: https://helps.ptengine.com/en/developer/open-api) is authenticated
by a **profile API key** (`x-api-key`), created by an Owner/Admin under Experience → Settings → External App Integration → API Keys.

1. Declare the scope and a secret in `manifest.json`: `"scopes": ["openapi:read", …]`, `"backend": { "secrets": ["PTENGINE_OPENAPI_KEY"], … }`
   (`PT_` is a reserved prefix — do not name the secret `PT_OPENAPI_KEY`).
2. After publishing, the workspace admin approves `openapi:read` in the consent dialog and pastes the key on the app's **Credentials** tab.
3. In a route:

   ```ts
   const res = await ctx.fetch(`${ctx.pt.openApiUrl}/datacenter/query`, {
       method: 'POST',
       headers: { 'x-api-key': ctx.secrets.PTENGINE_OPENAPI_KEY, 'content-type': 'application/json' },
       body: JSON.stringify(payload)
   });
   ```

   Never hard-code a backend host: `ctx.pt.openApiUrl` is per environment and the outbound worker only allows that host's `/open-api/v1/` prefix.

| Symptom | Cause |
| --- | --- |
| 501 `PT_OPENAPI_NOT_DECLARED` when reading `ctx.pt.openApiUrl` | `openapi:read` not in `manifest.scopes` (or not published yet) |
| 403 `EGRESS_PLATFORM_BLOCKED` on the call | scope not declared / not approved, or you called a path outside `/open-api/v1/` |
| 401 `{"code":4010}` | the admin has not filled `PTENGINE_OPENAPI_KEY` |
| 429 | the profile's plan rate limit (Free 3 / Trial 10 / Growth 30 requests per minute) |

**Boundary**: the key is stored **per app**, so this only fits apps used by one workspace (self-built or single-customer). A store app installed by many
workspaces would read the publisher's data with the publisher's key — do not do that; a gateway-based, identity-bound Open API is planned.

## Writing to the asset library (`asset:write`)

`ctx.pt.asset.*` writes into the **workspace's own asset library** — the same library the user
browses in the product. Four calls, all server-side, all audited.

**Versions**: `ctx.pt.asset` exists from **`@ptengine/app-backend` 0.6.0**; `asset:write` passes
manifest validation from **`@ptengine/app-sdk` 2.6.0**. On older packages `ctx.pt.asset` is simply
`undefined` (a `TypeError`, not a friendly error) and the scope is rejected at package time.

**Before anything works**: declare `"asset:write"` in `manifest.scopes`, publish, and have a
workspace admin approve it in the consent dialog. Unlike read scopes there is **no first-party
exemption** — an app the workspace built itself still needs that click, and a revoke removes the
permission immediately. Treat "first call 403s until approved" as the normal first-run path.

```ts
// 1. The app's own folder under the caller's personal root. Idempotent.
const { folderId } = await ctx.pt.asset.ensureFolder({ name: 'Weekly reports' });

// 2. A card in it. `content` must be the PtAssetDoc envelope (see below).
const { assetId } = await ctx.pt.asset.create({
    folderId,
    kind: 'note',
    name: 'Week 42',
    content: { name: 'Week 42', content: '## Highlights\n\n- …' }
});

// 3. Rewrite it later. `content` replaces wholesale, it does not merge.
await ctx.pt.asset.update({ assetId, name: 'Week 42 (revised)', content: { name: 'Week 42 (revised)', content: '…' } });

// 4. Attach a file. `body` may be a string or a ReadableStream — the stream is never read
//    by the runtime, so large files never land in memory.
const { sourceId } = await ctx.pt.asset.uploadSource({
    assetId, filename: 'report.csv', contentType: 'text/csv', body: csvStream
});
```

### `content` is an envelope, and getting it wrong fails silently

The server treats `content` as **opaque** — it validates `kind` against a registry and does not
look at a single byte of the body. So a wrong shape **does not error**: it stores fine, returns
200, records the audit row, and then the user finds **a card with a title and no body**. Nothing
in the chain will tell you; only the user will.

The product decides "is this the new envelope?" with
`typeof content.name === 'string' && typeof content.content === 'string'`. Miss either one and the
whole document falls back to a legacy reader that renders essentially nothing.

| Field | |
| --- | --- |
| `name` | **required** — usually the same string you pass to `create({ name })` |
| `content` | **required**, body as **Markdown**. Empty string is legal; `undefined` is not |
| `tagline` / `description` / `tags` / `img` | optional |

`content` is stored verbatim and handed back to the editor verbatim — it is **never** parsed back
into discrete fields. Want headings, lists or a table? Write them in that Markdown. Do not expect
the server to split it up by `kind`.

Two kinds are exceptions and do **not** use this envelope (`design_spec`, `proposal` — they keep
structured content). An app normally should not write those; if you must, confirm the shape with
the product side first.

### `kind` must be in the registry

`persona`, `brand_info`, `competitor`, `product`, `touchpoint`, `inspiration`, `methodology`,
`goal`, `design_spec`, `proposal`, `campaign`, `data_insight`, `note`. Anything else is a 400.
For a generic knowledge entry use `note` — with "a knowledge base is a folder under the Studio
library", the folder decides what the entry belongs to and `kind` only carries card shape.

### Files: limits live upstream, not in your code

`uploadSource` deliberately validates **neither size nor type** in the runtime. The real limits are
the product's own, shared with manual uploads in the UI:

- **20 MiB** per file
- mime allow-list: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`,
  `text/plain`, `text/markdown`, `text/csv`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)

Do not re-check these before calling — a second copy of a business rule drifts the moment the
product changes one. Let the call fail and surface the code.

| Symptom | Cause |
| --- | --- |
| 501 `PT_GATEWAY_NOT_BOUND` | `asset:write` not in `manifest.scopes`, or that version is not published yet |
| 403 `SCOPE_DENIED` | The token carries no `asset:write` — an admin has not approved it, or has revoked it |
| 403 `ASSET_FORBIDDEN` | The **calling user** cannot write that folder/asset. The token is user-bound: the app never exceeds the person using it |
| 413 `ASSET_TOO_LARGE` | File over 20 MiB |
| 415 `ASSET_TYPE_REJECTED` | `contentType` outside the allow-list above |
| 429 | Per-app write concurrency cap (2 in flight; reads have their own, separate budget of 6) |
| `PT_ASSET_FAILED` | Anything else — the upstream message is passed through, check the app logs |

### Three things that surprise people

1. **No `seedKey` parameter on `ensureFolder`.** The folder's stable identity is derived
   server-side from your authenticated `appId`, so an app can neither squat on the product's own
   folders nor forge another app's. The user may rename or move that folder; the next
   `ensureFolder` still returns the same id.
2. **`folderId` is required on `create`.** Omit it and the server falls back to a per-`kind`
   default location that may sit under a different root — where the user will not find it.
3. **`update({ content })` replaces, never merges.** Changing only the body still means sending
   `name` along; otherwise the new document lacks `name` and stops being recognised as the
   envelope — back to the blank card.

### What the user sees, and when

The app writes server-side. A user who already has the asset library open **will not see the new
card for up to 5 minutes** — the product caches that list and there is no push channel. This is
expected; do not "fix" it by writing twice. If the timing matters, tell the user to refresh.

## Calling an LLM (`ai:invoke`)

`ctx.pt.ai.*` calls a large language model through the platform gateway. **The credentials live
on the platform side** — your app never sees them and cannot send its own.

**Versions**: `ctx.pt.ai` exists from **`@ptengine/app-backend` 0.7.0**; `ai:invoke` passes
manifest validation from **`@ptengine/app-sdk` 2.7.0**. On older packages `ctx.pt.ai` is simply
not there.

**Before anything works**, four things must hold **at the same time**:

| | Who moves it | If missing |
| --- | --- | --- |
| `"ai:invoke"` in `manifest.scopes`, published | you | 501 `PT_GATEWAY_NOT_BOUND` |
| `@ptengine/app-backend` ≥ 0.7.0 | you | `ctx.pt.ai` is simply not there |
| A workspace admin approved it **once** | the workspace admin | 403 `AI_SCOPE_DENIED` |
| **The workspace is entitled to AI** | platform / sales side | also 403 `AI_SCOPE_DENIED` (see below) |

There is **no first-party exemption** on the third row — an app you uploaded into your own
workspace still needs that approval, because this scope **spends money**: the platform fronts the
bill and meters it per workspace.

⚠️ **The last two rows produce the identical error.** When a workspace is not entitled, the
platform never signs `ai:invoke` into the token at all — the gateway only sees "that scope is not
here" and cannot tell why. The distinction exists only in platform-side logs.

So **do not word that error as "ask your admin to approve it"**: for a workspace that is not
entitled, that sends the user to someone who cannot fix it. Say something like "AI is not
available for this workspace" and give them a way to reach support.

⚠️ **The fourth row is not yours to move.** `ai:invoke` is a **paid** capability that follows the
workspace's plan. So **do not make AI the only path through your app**: treat it as an
enhancement, catch those two 403s, and degrade — a workspace that cannot get the capability
should still find the rest of the app usable. An app that renders one full-page error is an app
those customers cannot install at all.

> ⚠️ `ai:invoke` is unrelated to the `ai` block in `manifest.json`. That block decides whether the
> right-hand AI assistant is integrated into your app. This scope decides whether your backend can
> call a model. The names are close; the features are not.

### Two calls, and the one that bites

```ts
// Complete result — the user waits for the whole generation.
const res = await ctx.pt.ai.chat({
    model: 'anthropic/claude-sonnet-5',          // provider prefix is REQUIRED
    messages: [{ role: 'user', content: 'Summarise last week in one paragraph.' }],
    max_tokens: 1024
});
return { text: res.choices[0].message.content };

// Streaming — return the Response straight from your route.
app.post('/ask', async ctx => ctx.pt.ai.stream({
    model: 'anthropic/claude-sonnet-5',
    messages: [{ role: 'user', content: ctx.body.question }]
}));
```

1. **`model` must carry the provider prefix** (`anthropic/claude-sonnet-5`). A bare model name is
   rejected upstream. The runtime does not add one for you — guessing the provider is worse than
   failing.
2. **Do not `await res.text()` on the streaming `Response` and forward that.** It buffers the whole
   SSE stream and turns streaming into a single late response. Short answers look fine, so this
   only shows up on the long ones — exactly the ones streaming was for. Use
   `res.body!.getReader()` if you need to inspect it as it arrives.
3. **`chat()` rejects `stream: true`** with 400 `PT_AI_BAD_INPUT`. Without that guard the call
   would `json()` an SSE stream and throw an unexplainable parse error.
4. Everything except `stream` is passed through untouched (`temperature`, `tools`, …). There is no
   allow-list, so new upstream parameters work the day they ship.

### The two 429s are not the same

| Code | HTTP | What to do |
| --- | --- | --- |
| `PT_GATEWAY_NOT_BOUND` | 501 | Declare `ai:invoke` and publish again |
| `TOKEN_MISSING` | 401 | This route is in `publicRoutes`, so there is no caller token |
| `AI_SCOPE_DENIED` | 403 | An admin has not approved it **or** the workspace is not entitled. **You cannot tell which** — see below |
| `AI_BUDGET_EXCEEDED` | 429 | **The workspace's AI budget is spent.** Raise the limit or wait for the window — **retrying will not help** |
| `AI_RATE_LIMITED` | 429 | Upstream throttling. This one *is* worth retrying |
| `AI_UPSTREAM_FAILED` | 502 | Upstream's own failure; the message is passed through verbatim |

**Never collapse those two 429s into one "please try again later".** One of them needs a human to
go raise a limit; telling the user to retry sends them into a loop that only ends when the window
rolls over, with no idea what happened.

## Diagnosis: backend symptom → cause

| Symptom | Cause and fix |
| --- | --- |
| 401 `TOKEN_MISSING` / `TOKEN_SIGNATURE_INVALID` / `TOKEN_AUD_MISMATCH` / `TOKEN_EXPIRED` / `TOKEN_CLAIMS_INCOMPLETE` | No `Authorization: Bearer …` header (hand-written `fetch` instead of the `api()` helper), a token minted for another app, or an expired one. Locally it usually means `vite` was started directly rather than `npm run dev`, so nothing signs tokens |
| 404 on a route you did write | The route key is missing from `routes`, carries an `/api` prefix, or a `:param` route was declared before the static route it shadows |
| 500 `AUTH_NOT_AVAILABLE` | `ctx.auth` read on a route listed in `publicRoutes` — use `ctx.authOrNull` there, or take the route out of the list |
| 501 `PT_GATEWAY_NOT_BOUND` | No data scope in `manifest.scopes`, or the version declaring it is not published and admin-approved yet. `ctx.pt.describe()` always returns this |
| 403 `SCOPE_REQUIRED` | The caller's token lacks the scope `ctx.requireScope()` demands — declare it and have an admin approve the new version |
| 403 `SCOPE_DENIED` on `ctx.pt.asset.*` | Not the same as `SCOPE_REQUIRED`: the token reached the asset endpoint without `asset:write`. Write scopes get **no first-party exemption**, so even your own app needs an admin to approve it once (and a revoke takes it back immediately) |
| An asset is created but shows up as a card with a title and no body | `content` was not the `PtAssetDoc` envelope — `name` and `content` are both required and both must be strings. Nothing errors on this path; see [Writing to the asset library](#writing-to-the-asset-library-assetwrite) |
| 500 `SECRET_NOT_DECLARED` / `VAR_NOT_DECLARED` | The name is not declared in the manifest, has no value on the admin page, or is missing from `backend/.dev.vars`. `PT_`-prefixed names always fail |
| Value changed on the admin page but the worker still reads the old one | Config is baked in at publish time — **republish**. Credentials take effect immediately, so this never applies to them |
| 500 `RESOURCE_NOT_DECLARED` | `backend.resources.database` / `.kv` / `.files` not `true`, or no matching local binding in `wrangler.jsonc` |
| 403 `RESOURCE_NOT_ALLOWED` at publish time | A customer app declared `resources.files` — object storage is official-apps-only |
| Outbound call hangs and then fails | The host is not in the manifest's outbound allow-list; an omitted or empty list means no outbound at all. Platform-owned and loopback hosts are always refused |
| D1 `too many SQL variables` | More than 100 bind parameters in one statement — batch ids at ~90, one statement per batch |
| A user sees another site's or workspace's rows | A query, KV key or R2 key missing `ctx.workspaceId` and/or `ctx.auth.sid` |
| Scheduled work never runs | Cron is silently dropped; there is no scheduler |
| A 500 whose body carries only a `requestId` | An unexpected throw. There is **no log console for app authors** — the stack and your `ctx.log` lines are reachable platform-side by that `requestId` only, so surface it in the UI and log breadcrumbs at every decision point |

## Not available (don't design around them)

Durable Objects, raw TCP `connect()`, `caches.default`, `request.cf`, mTLS client
certificates, Queues, Workflows, and **Cron Triggers / `scheduled()`** — cron config is
**silently dropped** at deploy time: no error, no warning, and the job simply never runs.
There is no scheduling primitive yet, so anything periodic must be triggered by a request.
