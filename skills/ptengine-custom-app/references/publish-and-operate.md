# Publishing and operating a Custom App on the platform

This is the platform-admin side of the workflow: everything that happens inside
Ptengine after (and around) `npm run package`. **Every step here is a human
action in the product UI — guide the user through it; do not attempt to
automate these screens with a browser.** UI wording below may lag the product
slightly — trust the product screen over this text.

> Availability note: Custom Apps are currently in a gated beta. If the entries
> described here are not visible in the product, the workspace/user is not in
> the beta allowlist yet — that is a rollout gate, not a bug in your bundle.

## Where things live

- **Apps explore page** — the "Apps" section in the left navigation. Team apps
  appear here as cards; this is also where users pin/unpin an app to their own
  left navigation.
- **App management page** — entered from the explore page ("custom app
  management"). Lists every app you can see, with status, current version, and
  actions (edit, upload version, publish/pause, permissions, local dev, delete).

## First-time flow: from zip to live

1. **Create the app** on the management page: name, description, icon (pick a
   built-in icon; you can adopt the bundle's own icon later). This creates the
   app record — it has no version yet and cannot be opened.
2. **Upload the bundle**: choose the zip produced by `npm run package`. The
   platform validates it (root `manifest.json`, entry exists, file-type
   whitelist, `manifest.version` must be higher than the last upload) and
   records a new version.
3. **Preview as draft**: a `draft` app does not appear in anyone's navigation,
   but it can be opened directly from the management page. Use this to verify
   the app works against real platform context before exposing it.
4. **Publish**: flips status to `published`. Publishing requires at least one
   uploaded version (server-enforced). The app now appears on the explore page
   for everyone it is shared with.
5. **Pin to navigation**: apps you created are pinned to your own left nav by
   default; apps shared to you are not — each user pins from the explore page.

Subsequent releases are just step 2 again (bump `manifest.version` first) — the
new version takes effect immediately for everyone; no re-publish needed.

## Adopting the bundle's name and icon

If `manifest.json` carries `display_name` / `icon`, they are **not** applied
automatically. In the app's edit dialog, "fill from app package" copies them
into the form for preview; they take effect when you press save. The platform
record (name + icon chosen there) is always the source of truth for what shows
in navigation.

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
  real host — real `context`, real `ui`/`nav`, real `data.query` — instead of
  the uploaded bundle.
- The setting lives only in that browser's localStorage: it affects no one
  else, and a persistent banner shows while it is active. Exit it from the
  banner when done — a forgotten dev entry looks like "the app is stale/broken
  on my machine only", which is painful to diagnose.
- A newly created app with no uploaded version can still be previewed this way.

## Status lifecycle

`draft ⇄ published ⇄ paused` (no `draft ⇄ paused` edge):

- **draft** — hidden from navigation, still openable for preview/iteration.
- **published** — visible (to those it's shared with, where pinned).
- **paused** — the platform actually takes the entry offline (the entry HTML is
  moved out of public hosting, not just hidden). Opening it shows a "paused"
  notice. Resume restores it without re-uploading.

**Delete** archives the hosted files first, then removes the app record. It is
an app-level action — there is no per-version rollback UI; to roll back, take
the previous build, **edit its `manifest.json` to a version higher than the
current one, re-run `npm run package`**, and upload that zip (re-uploading the
old zip as-is is rejected by the version check).
