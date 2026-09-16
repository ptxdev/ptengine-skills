# Publishing and operating a Custom App on the platform

This is the platform-admin side of the workflow: everything that happens inside
Ptengine after (and around) `npm run package`. **Every step here is a human
action in the product UI — guide the user through it; do not attempt to
automate these screens with a browser.** The one automated path is `ptx deploy`
from CI (below). UI wording may lag the product slightly — trust the product
screen over this text.

> Availability note: Custom Apps are currently in a gated beta, and apps with
> their own backend additionally need the platform's App Runtime enabled for the
> environment. If the entries described here are not visible, the
> workspace/user is not in the allowlist yet — that is a rollout gate, not a bug
> in your bundle. Local `npm run dev` is unaffected.

## Where things live

- **Apps explore page** — the "Apps" section in the left navigation. Team apps
  appear here as cards; this is also where users pin/unpin an app to their own
  left navigation.
- **App management page** — entered from the explore page ("custom app
  management"). Lists every app you can see, with status, current version, and
  actions (edit, upload version, publish/pause, permissions, local dev, delete).
  For apps with a backend it also carries the **configuration** and
  **credentials** tabs, and the scope/consent state.

## First-time flow: from zip to live

1. **Create the app** on the management page: name, description, icon (pick a
   built-in icon; you can adopt the bundle's own icon later). This creates the
   app record — it has no version yet and cannot be opened.
2. **Upload the bundle**: choose the zip produced by `npm run package`. The
   platform validates it (root `manifest.json`, entry exists, file-type
   whitelist, `manifest.version` higher than the last upload, and — for
   `schemaVersion: 2` — the backend entry, migration numbering, declaration
   limits and outbound allow-list syntax) and records a new version.
3. **Fill in values for anything the backend declares** — the configuration and
   credentials tabs. A declared item is **required unless the manifest marked it
   optional**, and a missing required value stops the publish with
   `SECRET_NOT_SET` / `CONFIG_NOT_SET`. Credential values can be written but
   never read back; the tab only shows whether one is set.
4. **Preview as draft**: a `draft` app does not appear in anyone's navigation,
   but it can be opened directly from the management page. Use this to verify
   the app works against real platform context before exposing it.
5. **Publish**: flips status to `published`. Publishing requires at least one
   uploaded version (server-enforced). The app now appears on the explore page
   for everyone it is shared with.
6. **Pin to navigation**: apps you created are pinned to your own left nav by
   default; apps shared to you are not — each user pins from the explore page.

Subsequent releases are just step 2 again (bump `manifest.version` first) — the
new version takes effect immediately for everyone; no re-publish needed.

## What "publish" does for an app with a backend

Publishing a `schemaVersion: 2` version runs a pipeline server-side: validate →
front-end assets to storage → create/reuse the declared resources → run pending
migrations → assemble the credential and config bindings → deploy the worker →
**atomically switch the version pointer** → health probe. A failing probe rolls
the deploy back automatically, so a successful publish really does mean the new
version is serving. It takes roughly 20–40 seconds with a backend.

Two consequences worth designing for:

- Front end and backend switch versions a beat apart, so **"new backend + old
  front end" is live for seconds on every publish**. Keep one release of API
  backwards compatibility: add fields and routes in one release, remove the old
  ones in the next.
- **Migrations are forward-only.** A rollback restores code, never schema.

## Scopes, consent and incremental permissions

`manifest.scopes` is no longer decorative for apps with a backend:

- The declared data scopes decide whether the deployed worker is given a data
  gateway binding at all. No data scope ⇒ `ctx.pt.query` throws 501
  `PT_GATEWAY_NOT_BOUND` no matter what the caller is allowed to do.
- The first time a user opens the app, `PtApp.auth.getAppToken()` rejects with
  `PT_CONSENT_REQUIRED` until a **workspace admin approves** the requested
  scopes. The host shows the consent dialog; after approval the app can call
  `getAppToken()` again and continue **without a page reload**. A non-admin user
  cannot approve — the app should say so rather than loop.
- **A version that asks for more scopes needs approval again.** Shipping a new
  scope in version N+1 means every workspace sees the consent dialog on first
  entry. Ask for the minimum up front and add scopes in a later version.
- Design the backend so a rollback to the previous, narrower version still
  works: put `ctx.requireScope()` only on routes that genuinely read platform
  data, so the rest of the app degrades instead of failing wholesale.

## Configuration vs credentials, at operating time

| | Credentials | Configuration |
| --- | --- | --- |
| Where the value lives | secret store (write-only from the UI) | platform database (readable in the UI) |
| Readable back | No — the tab only shows "set" | Yes |
| When a change takes effect | **Immediately**, next request | **Only after republishing** — the value is baked into the worker at publish time |
| Good for | third-party tokens, private keys, database passwords | endpoint addresses, timeouts, ids, feature flags you accept republishing for |

"Changed the value and nothing happened" is almost always a configuration value
that has not been republished.

## Name and icon come from the package

Uploading a version **updates the app record's name and icon from the
manifest automatically** — `display_name` (collapsed to the current UI language)
and `icon` (the file inside the zip) are applied to what users see in navigation
and on the explore page. Two exceptions worth knowing:

- **A name the creator typed by hand at creation time wins** over
  `display_name`, so a deliberately chosen workspace name is not overwritten by
  a later upload.
- **With no `icon` declared**, the app keeps the auto-generated monogram tile
  (or whatever icon was chosen in the product) — an absent declaration never
  blanks the icon.

The practical consequence: `display_name` and `icon` are part of the release.
Changing either in the manifest re-brands the app for everyone on the next
upload, so change them deliberately, and remember that a declared `icon` must
really exist in the zip (`ICON_NOT_FOUND` otherwise) with an allowed extension.

## Permissions

Sharing uses the platform's standard asset permission panel, with three levels:

| Level | Grants |
| --- | --- |
| Viewer | Sees the app in explore/nav, can open it |
| Editor | + edit name/description/icon, upload new versions, publish/pause/resume |
| Editor + delete | + delete the app |

Three things that surprise people:

- **Publishing a version only needs Editor**, not the top level.
- **Workspace owners/admins always have full access** — their access cannot be
  revoked from the app's permission panel (they are listed read-only there).
  To restrict them, change their workspace role, not the app ACL.
- Changing an app's permissions requires being a workspace owner/admin.

Permission changes are not pushed live: someone already inside the app keeps it
open until their next entry/refresh, at which point the platform re-checks and
evicts them if access was removed.

## Local dev entry (developing against the real platform)

On the management page, each app has a "local development" action: point it at
your dev server (e.g. `http://localhost:5173`). While set:

- Opening the app in the platform loads **your local dev server** inside the
  real host — real `context`, real `ui`/`nav`, real `data.query`, and a real App
  Token from `getAppToken()` — instead of the uploaded bundle. The `/api/*`
  calls go to whatever your dev server proxies them to, so this is also how you
  exercise the real consent flow against a local backend.
- The setting lives only in that browser's localStorage: it affects no one
  else, and a persistent banner shows while it is active. Exit it from the
  banner when done — a forgotten dev entry looks like "the app is stale/broken
  on my machine only", which is painful to diagnose.
- A newly created app with no uploaded version can still be previewed this way.

## Deploying from CI

`ptx deploy` uploads the packaged zip; `--publish` publishes it in the same
step, `--dry-run` prints what would happen without calling anything, and
`--stream` reports the publish pipeline step by step instead of waiting for one
response. It needs a **deploy credential scoped to that app** (generated on the
management page, shown once, revocable) plus the app id, both supplied through
CI variables. Never commit that credential or put an account-level one in CI —
any dependency in the job can read it, and `ptx doctor` flags a committed one.

## Status lifecycle and rollback

`draft ⇄ published ⇄ paused` (no `draft ⇄ paused` edge):

- **draft** — hidden from navigation, still openable for preview/iteration.
- **published** — visible (to those it's shared with, where pinned).
- **paused** — the platform actually takes the entry offline (the entry HTML is
  moved out of public hosting, not just hidden). Opening it shows a "paused"
  notice. Resume restores it without re-uploading.

**Rollback**: select an earlier version on the management page (CI can call the
app's rollback endpoint). It switches front end and backend together, because
they are one version. What it does **not** undo: applied migrations, data your
app has already written, and consent for scopes. If the rolled-back version
declares fewer scopes, routes guarded by the missing scope start returning 403
`SCOPE_REQUIRED` while the rest keeps working — which is exactly why scope
checks belong on individual routes.

**Delete** archives the hosted files first, then removes the app record. It is
an app-level action; there is no per-version delete. If you need to re-publish
an old build rather than roll back, edit its `manifest.json` to a version higher
than the current one and re-run `npm run package` — re-uploading the old zip
as-is is rejected by the version check.

## Diagnosing a live app

The error envelope `{ error: { code, message, requestId } }` is the handle for
everything server-side: there is **no log console for app authors**, so stack
traces and `ctx.log` lines are only reachable platform-side by that `requestId`.
Surface it in the UI when a call fails, and log a breadcrumb with `ctx.log` at
every decision point you would otherwise want a debugger for. `GET
/api/__health` (built in) tells you whether the current version is serving at
all; a `/public/status` route of your own is the place to report which resources
and bindings are actually present.
