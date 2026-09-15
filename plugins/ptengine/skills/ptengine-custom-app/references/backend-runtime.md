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
| `ctx.fetch(url, init)` | Outbound with a 10s default `timeoutMs` and structured logging; a caller-supplied `signal` still works. Whether a host is reachable is decided by the manifest's outbound allow-list, not by this call |
| `ctx.secrets.X` / `ctx.vars.X` | Only names declared in the manifest resolve; anything else throws `SECRET_NOT_DECLARED` / `VAR_NOT_DECLARED` instead of yielding `undefined`. `PT_`-prefixed names are reserved and always refused. An empty string is a legitimate value |
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

## Not available (don't design around them)

Durable Objects, raw TCP `connect()`, `caches.default`, `request.cf`, mTLS client
certificates, Queues, Workflows, and **Cron Triggers / `scheduled()`** — cron config is
**silently dropped** at deploy time: no error, no warning, and the job simply never runs.
There is no scheduling primitive yet, so anything periodic must be triggered by a request.
