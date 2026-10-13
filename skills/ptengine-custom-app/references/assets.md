# Reading Ptengine assets from a Custom App

Two paths, one registry, one result shape. Both run **as the calling user**: an app sees exactly the
assets that user can see in Ptengine's Drive — never more.

| Path | Where | Needs |
| --- | --- | --- |
| Bridge | `window.PtApp.asset.list / sharedWithMe / get` (`@ptengine/app-sdk` ≥ 2.8.0) | `asset:read` in `manifest.scopes`; feature-detect with `if (PtApp.asset)` — an older host has no `asset` |
| Backend | `ctx.pt.asset.list / sharedWithMe / get` (`@ptengine/app-backend` ≥ 0.8.0) | same scope in a **published** version. 501 `PT_GATEWAY_NOT_BOUND` only when the manifest declares neither any data scope (`analytics:read` / `profile:read` / `user:read` / `openapi:read` / `asset:read`) nor `asset:write` (or that version is not published yet) — the gateway is bound at deploy time from the manifest, regardless of approval. Other data scopes declared but `asset:read` missing, or an external app not yet approved → 403 `SCOPE_DENIED` (`requiredScope: 'asset:read'`) instead |

`asset:read` is a **read** scope: an app built and uploaded by the workspace itself is implicitly
authorized; store / external apps need admin consent. (Writing is a different scope with different
rules — `asset:write`, backend only, see `backend-runtime.md`.)

## Shapes

- `list({ folderId?, types?, keyword?, scope?, cursor?, size? })` → `{ items, nextCursor, hasMore }`.
  Omit `folderId` for the root. `keyword` matches names **inside that one folder only**; `scope` is
  `children` (default) or `subtree` (also match inside its sub-folders) — no `folderId` means no
  cross-tree search (see [Searching is per folder](#searching-is-per-folder)). Cursor paging only:
  pass back `nextCursor`; **trust `hasMore`, not `items.length`** (short pages are normal).
  `size` 1..100, default 50.
- `sharedWithMe({ cursor?, size? })` → same shape. Top-level nodes shared to the user from other
  people's personal spaces — the root listing does not reach them.
- `get({ type, id, include? })` → detail. `type` is **only** `folder | page | group | studio`.
  `image` / `font` / `shortcut` carry all their fields on the list node (`url`, `familyName`,
  `targetType` / `targetId` …) — call `get` on a shortcut's target instead. `component` is not open
  yet. `studio.sources[].textContent` is **omitted unless** `include: ['sourceText']` (can be large),
  and even then exists **only for text sources** — uploaded files are `null`, read their `url`.
- Node types on a list: `folder page group image component font studio shortcut`; `insight` is not open.

## Searching is per folder; `textContent` is text-only

**Searching is per folder.** `keyword` matches names inside one folder: pass its `folderId`; add
`scope: 'subtree'` to also match inside its sub-folders. Without `folderId` there is **no cross-tree
search** — the root listing only matches the root's own entries (for users with restricted
permissions, just their visible top-level entries). This mirrors the product's own Drive search,
which searches the open folder. To find something you wrote, start from the folder you wrote it
into (e.g. the one `ensureFolder` returned).

**`textContent` exists only for text sources** — text pasted in the product UI
(`sources[].type === 'text'`). Files added with `uploadSource` (or uploaded in the UI) are
`file` / `image` sources: their `textContent` is always `null`, and their content is at `url`.

## Ids: read nodes vs. write calls

**Which id is which.** The write calls (`create` / `update` / `uploadSource`) call the Studio
entity's id `assetId`. On the read side that same value is the node's **`id`** — pass it straight
to `get({ type: 'studio', id })`, and match it against `node.id` when looking for what you just
wrote. The `assetId` field on a read node is a different id: the permission system's (pacl) asset
id. Never compare a written `assetId` with a node's `assetId`.

**Before writing asset code, read `node_modules/@ptengine/app-sdk/asset-read.llms.txt`** — the readable
contract: every node type's fields, the four detail shapes, inputs, paging rules and error codes.
`asset-read.schema.json` (same package) is the machine-readable source the TypeScript types are
generated from; read it for exact nullability. Never guess field names.

## Errors pass through verbatim

Codes declared by the schema: `SCOPE_DENIED` (with `requiredScope: 'asset:read'`),
`ASSET_TYPE_UNSUPPORTED` (e.g. `get` on an `image`), `INVALID_INPUT`, `NOT_FOUND` (the asset does
not exist, or the permission service returned nothing for it), `TOO_MANY_CONCURRENT_QUERIES`,
`IAM_UNAVAILABLE` (transient — retry later), `CAPABILITY_UNKNOWN`.
Also expect 403 `FORBIDDEN`: the asset exists but the calling user's permissions deny it — an
upstream code passed through verbatim, **not** in the schema's list. The list is **not
exhaustive**: other upstream codes pass through as-is, so handle unknown codes generically. Only an unparseable backend envelope degrades to `PT_ASSET_FAILED`; on the bridge,
`PT_HOST_UNAVAILABLE` means the host is unreachable, the handshake failed, or the host returned an
error frame without a code.

## Walking trees on the bridge

Bridge asset calls share the host's queue with `data.query`: 4 in flight, 50 queued. A route change
(including `nav.syncRoute`) cancels queued calls with `QUERY_CANCELLED`; a full queue rejects with
`QUERY_QUEUE_FULL`. When walking recursively keep 2–3 calls in flight — never `Promise.all` a whole
level. To locate something by name, search the folder you expect it in (see above) — a root-level
`keyword` will not find it deeper down.

## Hard rules

1. Walk whole trees **from the bridge**, not from the backend — each backend `list` page / `get` is
   one subrequest against the Worker's per-invocation quota (as low as 10 on the free tier).
2. Never cache `textContent` or `url` of assets in your own storage on the user's behalf — the user's
   permissions can be revoked and your copy would outlive them.
3. Do not infer permissions from what you can list; `get` re-checks on every call.
