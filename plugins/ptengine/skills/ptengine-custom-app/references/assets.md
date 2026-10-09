# Reading Ptengine assets from a Custom App

Two paths, one registry, one result shape. Both run **as the calling user**: an app sees exactly the
assets that user can see in Ptengine's Drive — never more.

| Path | Where | Needs |
| --- | --- | --- |
| Bridge | `window.PtApp.asset.list / sharedWithMe / get` (`@ptengine/app-sdk` ≥ 2.7.0) | `asset:read` in `manifest.scopes`; feature-detect with `if (PtApp.asset)` — an older host has no `asset` |
| Backend | `ctx.pt.asset.list / sharedWithMe / get` (`@ptengine/app-backend` ≥ 0.7.0) | same scope, published and (for external apps) admin-approved — otherwise 501 `PT_GATEWAY_NOT_BOUND` |

`asset:read` is a **read** scope: an app built and uploaded by the workspace itself is implicitly
authorized; store / external apps need admin consent. (Writing is a different scope with different
rules — `asset:write`, backend only, see `backend-runtime.md`.)

## Shapes

- `list({ folderId?, types?, keyword?, scope?, cursor?, size? })` → `{ items, nextCursor, hasMore }`.
  Omit `folderId` for the root. `scope` is `children` (default) or `subtree`. Cursor paging only:
  pass back `nextCursor`; **trust `hasMore`, not `items.length`** (short pages are normal).
  `size` 1..100, default 50.
- `sharedWithMe({ cursor?, size? })` → same shape. Top-level nodes shared to the user from other
  people's personal spaces — the root listing does not reach them.
- `get({ type, id, include? })` → detail. `type` is **only** `folder | page | group | studio`.
  `image` / `font` / `shortcut` carry all their fields on the list node (`url`, `familyName`,
  `targetType` / `targetId` …) — call `get` on a shortcut's target instead. `component` is not open
  yet. `studio.sources[].textContent` is **omitted unless** `include: ['sourceText']` (can be large).
- Node types on a list: `folder page group image component font studio shortcut`; `insight` is not open.

Full field lists: `asset-read.schema.json` in `@ptengine/app-sdk` (the TypeScript types are generated
from it) — read it instead of guessing field names.

## Errors pass through verbatim

Codes declared by the schema: `SCOPE_DENIED` (with `requiredScope: 'asset:read'`),
`ASSET_TYPE_UNSUPPORTED` (e.g. `get` on an `image`), `INVALID_INPUT`, `NOT_FOUND` (the asset does
not exist **or** the user cannot see it — the two are deliberately indistinguishable),
`TOO_MANY_CONCURRENT_QUERIES`, `IAM_UNAVAILABLE` (transient — retry later), `CAPABILITY_UNKNOWN`.
The list is **not exhaustive**: other upstream codes pass through as-is, so handle unknown codes
generically. Only an unparseable backend envelope degrades to `PT_ASSET_FAILED`; on the bridge,
`PT_HOST_UNAVAILABLE` means the app is not running inside Ptengine.

## Hard rules

1. Walk whole trees **from the bridge**, not from the backend — each backend `list` page / `get` is
   one subrequest against the Worker's per-invocation quota (as low as 10 on the free tier).
2. Never cache `textContent` or `url` of assets in your own storage on the user's behalf — the user's
   permissions can be revoked and your copy would outlive them.
3. Do not infer permissions from what you can list; `get` re-checks on every call.
