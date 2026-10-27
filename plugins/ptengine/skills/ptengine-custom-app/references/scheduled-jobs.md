# Scheduled jobs and channel notifications (`jobs:run` / `notify:send`)

> **Pre-release.** Available on the dev / staging platforms only, with `@ptengine/app-backend`
> ≥ 0.9.0-rc.1 and `@ptengine/app-sdk` ≥ 2.10.0-rc.1 (npm dist-tag `next`) — starter tag
> `next-3.8.0-rc.1`. On older packages the types are missing and the calls don't exist.
> The starter's `AGENTS.md` (section 「定时任务（backend.jobs）」) is the authoritative,
> field-by-field version of this page.

A Worker cannot schedule itself (cron triggers are silently dropped). The **platform scheduler**
calls your backend instead, on the schedule a **user** picked.

## The two-layer model

- **Your app** declares *subscription items* (job types) in the manifest and, in each job route,
  **produces content**: `ctx.pt.notify.send(...)` and/or a returned `archive`.
- **The user** decides everything else in the host's **subscription drawer** (the "Subscribe" button
  in the toolbar above your app): which item, title, schedule (presets or cron + time zone), **which
  notification channels** (0–5, created by a workspace admin: Slack, Microsoft Teams workflow webhook,
  Chatwork, generic webhook), preview, then subscribe; later edit / pause / delete.
- **Your app never builds subscription UI and never sees channels** (names, types, credentials).
  Never put channel names in `params`.

## 1. Manifest

```jsonc
"scopes": [/* … */ "jobs:run", "notify:send"],
"backend": {
  /* entry, routes, … */
  "jobs": [
    { "type": "daily-report", "route": "POST /jobs/daily-report", "title": "Daily report", "preview": true,
      "displayName": { "en-US": "Daily report", "ja-JP": "日次レポート", "zh-CN": "日报" },
      "defaultCron": "0 9 * * *", "defaultParams": { "range": "yesterday" } },
    { "type": "weekly-report", "route": "POST /jobs/weekly-report", "title": "Weekly report", "preview": true,
      "defaultCron": "0 9 * * 1" },
    { "type": "crm-sync", "route": "POST /jobs/crm-sync", "title": "CRM sync", "subscribable": false }
  ],
  "notify": { "instant": true }          // only if user requests (not jobs) also send — see §4
}
```

- **Daily / weekly / monthly are three types with three `defaultCron`s**, not one type with a period param.
- `title` is required; `displayName` / `description` (keys `zh-CN` / `en-US` / `ja-JP`) are what the drawer shows.
- `preview: true` makes the type previewable; `subscribable: false` hides it from the drawer (for jobs your
  backend creates itself with `ctx.pt.jobs.create`).
- `jobs:run` and `notify:send` are **write-class scopes**: an admin must approve them once, even for your own app.
- Tenant apps: two runs of one job are at least **1 hour** apart. The app must be **published** (drafts can't be subscribed).
- `npm run doctor` checks all of this (missing scope, route not in `routes`, no `requireTrigger`, item field shapes).

## 2. The job route

```ts
'POST /jobs/weekly-report': async (ctx) => {
    ctx.requireTrigger('job');                 // first line, always: a user token gets 403 JOB_ONLY
    const data = await ctx.pt.query('traffic_insight', { /* … */ });
    const r = await ctx.pt.notify.send({       // goes to the channels THIS subscription picked
        title: 'Weekly report',                // 1–150 chars, no line breaks
        text: summarize(data),                 // optional, ≤ 3000 chars plain text
        link: { label: 'Open report', path: '#/reports/weekly' }   // in-app path only, never a URL
    });
    ctx.log('notify.send', { status: r.status, sent: r.sent, failed: r.failed });
    return { archive: { title: 'Weekly report', markdown: toMarkdown(data) } };   // optional
}
```

- Body = the subscription's `params`. Add the same key to `ApiRoutes` in `shared/api.ts` (response type `JobRunResult`).
- **Delivery is at-least-once**: the same `ctx.auth.runId` can arrive twice. Claim it in D1 first, then do side effects.
- `notify.send` result: `sent` · `partial` (some targets failed — **don't resend the whole message**) ·
  `intercepted` (preview) · `no_targets` (not an error; the subscription has no channel — the run still succeeds).
  Every target failing throws `NOTIFY_CHANNEL_SEND_FAILED` (5xx — **match on the code**, not the status) with the
  per-target codes in `e.detail.deliveryErrors` (`CHANNEL_HTTP_<status>`, `CHANNEL_TIMEOUT`, …). No automatic retry.
- Limits per run: ≤ 10 units, one unit per message × target. Per workspace: ≤ 30 deliveries per UTC minute.
- Returned `archive` (`{ title?, markdown, files? }`) is stored by the platform; if the subscriber ticked
  **"Also save to my assets"**, each successful run lands in their asset library — no code needed.
- A failed run (5xx / timeout) is retried up to 4 attempts in total; a 4xx is not retried. Five failed runs in a
  row pause the job.

## 3. Preview

The drawer's "Generate preview" runs the route **for real** with `ctx.auth.preview === true`:

- **Call `notify.send` as usual** — the platform intercepts it (`status: 'intercepted'`) and shows what would be sent
  and to which channels. Skipping it leaves the preview empty.
- Writes are refused (`PREVIEW_READONLY` for `ctx.pt.jobs.*` mutations and asset writes); skip your own external
  side effects and your idempotency claim when `ctx.auth.preview` is true.
- `ctx.log(...)` lines show up in the preview panel.

## 4. Sending from a user request ("instant")

`notify.send` called from a normal user request goes to the app's **instant notification channels**
(configured on the app's admin page, "Instant notifications"). This requires `backend.notify.instant: true`;
without it the call returns `no_targets` / `APP_INSTANT_NOT_DECLARED`. An empty instant list returns
`no_targets` / `APP_DEFAULT_EMPTY` — tell the user to ask an admin to configure it.

## 5. Opening the drawer from your UI (optional)

The toolbar button always works; this is only a shortcut. **Always capability-detect** — older runtimes don't have it:

```ts
const open = window.PtApp?.subscriptions?.open;
if (typeof open !== 'function') showHint('Click "Subscribe" at the top right');
else open({ type: 'weekly-report' }).then(({ changed }) => { if (changed) refresh(); }).catch(e => {
    if (e.code === 'PT_METHOD_NOT_ALLOWED' || e.code === 'PT_SUBSCRIPTIONS_UNAVAILABLE') showHint('Click "Subscribe" at the top right');
    else if (e.code !== 'PT_SUBSCRIPTIONS_BUSY') throw e;          // BUSY = the drawer is already open
});
```

## Not available yet

- **Email** (`ctx.pt.notify.email`) returns `NOTIFY_UNAVAILABLE` — send to channels with `notify.send`.
- Chart images (`ctx.pt.render.chart`) may be switched off on a platform; don't make them the only content.

## Local development

`npm run dev`, then in another terminal:

```bash
npm run ptx -- job run weekly-report --params '{"range":"last7d"}'   # a real run
npm run ptx -- job run weekly-report --preview                       # a preview run
```

Nothing is delivered locally: messages go to `.ptx/outbox/`; simulate targets with `.ptx/notify-targets.json`
(`[]` = no targets). The local `ctx.pt.jobs.*` is an in-memory stub and never fires on a schedule.
