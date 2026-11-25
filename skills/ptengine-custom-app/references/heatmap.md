# Listing, opening and capturing heatmaps from a Custom App

The same steps the product's heatmap app takes: **list** the pages with the `heatmap_page_list`
queryType, then **open** one page's heatmap overlay (or just generate its link) with
`PtApp.heatmap` — or **capture** its heatmap as images (what the product's camera button
downloads) to show in your app or put into a report. All of them run **as the calling user** and
apply the same free-plan heatmap quota as the product's heatmap list.

| Step | Where | Needs |
| --- | --- | --- |
| List | `PtApp.data.query({ queryType: 'heatmap_page_list', … })` — also `ctx.pt.query('heatmap_page_list', …)` from a backend, same rows | `analytics:read` in `manifest.scopes` |
| Open / link | `window.PtApp.heatmap.open / createLink` — **Bridge only** (`@ptengine/app-sdk` ≥ 2.9.0); there is no backend equivalent | `analytics:read` in `manifest.scopes`; feature-detect with `if (PtApp.heatmap)` **and** handle `PT_METHOD_NOT_ALLOWED` (see below) |
| Capture (images) | `PtApp.heatmap.capture / getCapture` (`@ptengine/app-sdk` ≥ 2.11.0) **and** `ctx.pt.heatmap.capture / getCapture` from a backend, incl. scheduled jobs (`@ptengine/app-backend` ≥ 0.10.0) — same shapes | `analytics:read` (no extra scope) — see [Capturing heatmap images](#capturing-heatmap-images-capture--getcapture) |

`analytics:read` is a data scope: declaring it is not enough, it must also be granted — see
[`data-queries.md`](data-queries.md) for how data scope consent works and what `SCOPE_DENIED` means.

**Feature detection:** `PtApp.heatmap` exists once the runtime SDK the platform injects into your
app is ≥ 2.9.0 — it reflects that runtime SDK version, not whether the host page supports heatmaps.
If the host is older than the runtime SDK, calling it rejects with `PT_METHOD_NOT_ALLOWED`; treat
that as "heatmaps unavailable" (e.g. hide the button).

## The list: `heatmap_page_list`

```ts
const res = await window.PtApp.data.query({
  queryType: 'heatmap_page_list',
  params: { kind: 'pages', timeRange: { key: 'lastDays', days: 30 } },
});
```

- `kind`: `pages` (default — top pages by page views) or `landing` (top landing pages by entrances;
  optional `conversion: { id, name? }`, `id: 'all'` = all conversions). `timeRange` is required, same
  object form as every other queryType (see [`data-queries.md`](data-queries.md)).
- Columns on every row: `pid`, `url` (the merged page URL — **pass this to `heatmap.open`**), `title`
  (may be an empty string), `locked`, `entrances`, `newVisitsRate`, `bounceRate`.
  - `kind: 'pages'` only: `clicks`, `pageView`, `visits`, `exitRate`, `avgTimeOnPage`.
  - `kind: 'landing'` only: `avgPageVisits`, `avgVisitDuration`, `conversions`, `conversionRate`.
  - Rates are 0–1, durations in seconds, missing values are `null` (not 0).
- **The candidate set is always the top 200.** `limit` (1–200, default 200) only caps the output
  rows; it does not reach further down the ranking. There is **no server-side search** — filter,
  sort and page the rows yourself.
- **Free-plan (quota-limited) profiles**: `metadata.quotaLimited` is `true`, only 10 rows come back,
  the configured page is pinned first (an all-zero row with `pid: 'quota:<url>'` when it has no
  data in the range), and every other row has `locked: true`.

Read `node_modules/@ptengine/app-sdk/data-query.llms.txt` (the `heatmap_page_list` section) for the
exact params; never write them from memory.

## Opening: `PtApp.heatmap`

- `open({ url, dateRange?, deviceType? })` opens the overlay in a new tab once the host's popup
  succeeded, and resolves to the link. `createLink(input)` only generates the link (to put in a
  table, copy to the clipboard …).
- Input: `url` — a `heatmap_page_list` row's `url`, or any page URL of this profile (`http(s)` or
  no scheme; any other scheme such as `javascript:` is rejected with `HEATMAP_INPUT_INVALID`);
  `dateRange?: { start, end }` as `YYYY-MM-DD` (default: the last 30 days including today, in the
  profile's time zone; the end date may not be after today); `deviceType?: 'PC' | 'MOBILE' | 'TABLET'`
  (default: picked from the page's traffic).
- Both resolve to `{ url, deviceType, dateRange }` — the full overlay link plus the device and dates
  actually used. It is the same link a member gets from "view heatmap" in the product.

```ts
button.onclick = async () => {
  try {
    await window.PtApp.heatmap.open({ url: row.url });   // first thing in the handler — no await before it
  } catch (err) {
    if ((err as { code?: string }).code === 'PT_POPUP_BLOCKED') {
      const link = await window.PtApp.heatmap.createLink({ url: row.url });
      showLink(link.url);                                 // let the user click it
    } else {
      showError(err);
    }
  }
};
```

## Errors pass through verbatim

| `err.code` | Meaning |
| --- | --- |
| `SCOPE_DENIED` | `analytics:read` not declared / not granted |
| `PROFILE_FORBIDDEN` | the calling user cannot access this profile |
| `CONSENT_UNAVAILABLE` | the consent check is unavailable — retry later |
| `TOO_MANY_CONCURRENT_QUERIES` | throttled — back off and retry |
| `HEATMAP_NOT_ALLOWED` | free-plan profile and `url` is not the configured page (a `locked` row) |
| `HEATMAP_INPUT_INVALID` | bad `url` / `dateRange` / `deviceType` (e.g. an end date after today) |
| `HEATMAP_FAILED` | the platform could not create the heatmap link — retry later |
| `PT_POPUP_BLOCKED` | `open` only: the browser blocked the new tab |
| `PT_METHOD_NOT_ALLOWED` | the host is older than the SDK and has no heatmap support |

The list is not exhaustive: you may also see `UNAUTHORIZED`, `SID_REQUIRED`, `INTERNAL_ERROR` and
the bridge's other `PT_*` errors — always keep a generic fallback branch. Like `data.query`, heatmap
calls have **no client-side timeout** — show a loading state.

## Hard rules

1. **Call `open` directly inside the click handler**, before awaiting anything else: browsers only
   allow a new tab while the click's user activation is still valid. Don't fetch the list, a token
   or anything else between the click and `open`.
2. **On `PT_POPUP_BLOCKED`, fall back to `createLink`** and show the link for the user to click —
   never retry `open` in a loop.
3. **Don't offer an open action on `locked` rows** — show them as locked; opening one fails with
   `HEATMAP_NOT_ALLOWED`.
4. **The link only works for signed-in members of the workspace.** Don't present it as a shareable
   public link, and don't send it to people outside the workspace.
5. List pages with `heatmap_page_list` — don't rebuild the list from `page_insight`: that misses the
   heatmap quota (`locked`, `quotaLimited`) and the product's ranking.

## Capturing heatmap images (`capture` / `getCapture`)

`capture` renders one page's heatmaps as JPEG images — the same images the product's camera button
downloads — and hands back **public image URLs**. It is a task: `capture` **returns immediately**
and the images are drawn in the background; you poll with `getCapture`. Front end and backend have
the same two methods with the same input and result:

| Method | Where | Returns |
| --- | --- | --- |
| `PtApp.heatmap.capture(input)` / `ctx.pt.heatmap.capture(input)` | bridge / app backend (any route, incl. job routes) | a capture — usually `status: 'queued'`; `succeeded` with `cached: true` straight away on a cache hit |
| `PtApp.heatmap.getCapture(captureId)` / `ctx.pt.heatmap.getCapture(captureId)` | same | the same capture, current status |

**Versions and feature detection:** `@ptengine/app-sdk` ≥ 2.11.0, `@ptengine/app-backend` ≥ 0.10.0.
In the front end check `typeof PtApp.heatmap?.capture === 'function'` — like `PtApp.heatmap`, it
reflects the injected runtime SDK, so **also** treat `PT_METHOD_NOT_ALLOWED` (older host) as
"capture unavailable". On an older `@ptengine/app-backend`, `ctx.pt.heatmap` simply isn't there.

### Input

| Field | Meaning |
| --- | --- |
| `url` | A page URL of this profile (a `heatmap_page_list` row's `url`, or any page URL). With a query string it is taken as that single URL, otherwise as the merged URL (same as `createLink`). `http(s)` or no scheme; any other scheme → `HEATMAP_INPUT_INVALID` |
| `heatmapTypes` | **1–4** of `clickMap`, `attentionMap`, `clickElementMap`, `conversionElementMap`, `dropOff`, `attentionBlockMap`, `conversionBlockMap`; de-duplicated, order kept. The page is opened once and each type is drawn in turn |
| `dateRange?` | `{ start, end }` as `YYYY-MM-DD` in the profile's time zone. Default: the last 30 days including today. The end date may not be after today |
| `deviceType?` | **`'PC'` or `'MOBILE'` only** — no `TABLET` (unlike `open` / `createLink`). Default: picked from the page's traffic (a picked tablet is captured as `MOBILE`) |
| `showAllClicks?` | `clickMap` only — the product's "Show all clicks". Default `false` |
| `conversionId?` | Conversion types (`conversionElementMap`, `conversionBlockMap`). Default: the page's first bound conversion |

`clickElementMap` / `attentionBlockMap` / `conversionBlockMap` need elements / blocks configured on
the page; conversion types need a conversion bound to it — otherwise the task fails (see below)
rather than returning an image with nothing marked. Identity keys (`sid`, `appId`, workspace …)
are never taken from the payload; the host / gateway injects them.

### Result (`PtAppHeatmapCapture`, backend `PtHeatmapCapture`)

```ts
{
  captureId: string,                         // 32 lowercase hex
  status: 'queued' | 'running' | 'succeeded' | 'failed',
  input: { url, heatmapTypes, dateRange, deviceType },   // normalized: what was actually used
  images?: Array<{                           // succeeded only, same order as input.heatmapTypes
    heatmapType,
    full:  { url, contentType: 'image/jpeg', bytes, width, height },   // the whole page in one image
    parts: Array<{ url, contentType: 'image/jpeg', bytes, width, height }>,  // top to bottom
  }>,
  error?: { code, message },                 // failed only — the call succeeded, the task failed
  cached: boolean,                           // served from cache: nothing rendered, no quota used
  createdAt: string, finishedAt?: string,    // ISO 8601
  expiresAt: string,                         // the image URLs stop working after this (~90 days)
}
```

- `width` / `height` are device pixels. `parts` cut the page into fixed-height segments — **PC every
  3000px, MOBILE every 1200px (CSS pixels)** — the same cut as the product's camera zip.
- Image URLs are **public**: anyone holding one can download it, no credentials (safety comes from the
  unguessable `captureId` in the path). Don't log them anywhere public; they expire after ~90 days —
  store the image yourself if you need it longer.
- Submitting the **same parameters again from the same app** returns the **same `captureId`** while
  that task is still in flight (`queued` / `running`) or cached (another app in the workspace gets its own task): a succeeded capture is served from cache (`cached: true`)
  for 24 h when the range ends before today, 1 h when it includes today. After a failure, or once the
  cache has expired, the same call creates a new task with a new `captureId` (and an omitted
  `dateRange` resolves to a different range on a different day).
- `attentionBlockMap` block labels (durations like "1m 5s") are rendered in the language of whoever
  triggered the render; a later call within the cache window gets the cached image, i.e. **the first
  caller's language**.

### Polling

The SDKs don't poll for you. **First check 10 s after submitting, then every 5 s.** A capture can
take up to **~6 minutes**; one still `queued` after 30 minutes, or `running` for over 15 minutes, is failed by the platform
with `HEATMAP_CAPTURE_TIMEOUT`, so a loop that follows this cadence always ends.

```ts
import type { PtAppHeatmapCapture } from '@ptengine/app-sdk';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// No client deadline needed: the platform fails a task queued over 30 minutes or running over 15 minutes.
async function waitForCapture(cap: PtAppHeatmapCapture): Promise<PtAppHeatmapCapture> {
  const hm = window.PtApp.heatmap;
  if (cap.status === 'succeeded' || cap.status === 'failed') return cap;   // cache hit
  await sleep(10_000);
  for (;;) {
    cap = await hm.getCapture(cap.captureId);
    if (cap.status === 'succeeded' || cap.status === 'failed') return cap;
    await sleep(5_000);
  }
}

const canCapture = typeof window.PtApp.heatmap?.capture === 'function';   // else hide the button

async function onCapture(row: { url: string }) {
  showLoading();   // tell the user this can take a few minutes
  try {
    const cap = await waitForCapture(await window.PtApp.heatmap.capture({
      url: row.url, heatmapTypes: ['clickMap', 'attentionMap'], deviceType: 'PC',
    }));
    if (cap.status === 'succeeded') cap.images!.forEach(img => showImage(img.heatmapType, img.full.url));
    else showTaskError(cap.error!.code);            // see "Task failures" below
  } catch (err) {
    showCallError((err as { code?: string }).code); // see "Call errors" below; PT_METHOD_NOT_ALLOWED = unavailable
  }
}
```

Bridge calls have a **30 s client-side timeout** (`PT_TIMEOUT`). A `PT_TIMEOUT` on `capture` is safe
to retry: the same parameters return the same `captureId`, so no second task is created and no
second quota is charged. Locally (`npm run dev`, fake host) `capture` resolves at once as
`succeeded` with placeholder `data:` images, and `getCapture` replays it — test real captures on
the platform.

### In a scheduled job: finish in the next run if needed

One run has a 300 s budget. Most captures finish inside it; when one doesn't, **store its
`captureId` and pick it up with `getCapture` in the next run** instead of submitting again
(while it is still in flight, resubmitting would dedupe to the same task too, but costs another
gateway slot). Two runs of a
tenant job are at least an hour apart, so by then the capture has finished or failed.

```ts
'POST /jobs/weekly-heatmap': async (ctx) => {
  ctx.requireTrigger('job');
  const key = `hm-pending:${ctx.workspaceId}:${ctx.auth.sid}:${ctx.auth.jobId}`;   // needs resources.kv
  const started = Date.now();   // `sleep` and `report` (build + send the message) are yours

  // 1) a capture left over from the previous run — never in a preview: a preview must not consume
  //    (send + delete) what the next real run is going to deliver (scheduled-jobs.md §3)
  const pendingId = ctx.auth.preview ? null : await ctx.kv.get(key);
  if (pendingId) {
    const prev = await ctx.pt.heatmap.getCapture(pendingId).catch(() => null);  // NOT_FOUND etc. → drop it
    if (prev?.status === 'succeeded') await report(ctx, prev);
    if (!prev || prev.status !== 'queued' && prev.status !== 'running') await ctx.kv.delete(key);
  }

  // 2) this run's capture
  let cap = await ctx.pt.heatmap.capture({ url: ctx.body.url, heatmapTypes: ['clickMap'], deviceType: 'PC' });
  if (cap.status !== 'succeeded' && cap.status !== 'failed') await sleep(10_000);
  while ((cap.status === 'queued' || cap.status === 'running') && Date.now() - started < 240_000) {
    cap = await ctx.pt.heatmap.getCapture(cap.captureId);
    if (cap.status === 'queued' || cap.status === 'running') await sleep(5_000);
  }
  if (cap.status === 'succeeded') await report(ctx, cap);
  else if (cap.status === 'failed') ctx.log('heatmap capture failed', { code: cap.error!.code });
  else if (!ctx.auth.preview) await ctx.kv.put(key, cap.captureId, { expirationTtl: 7 * 24 * 3600 });   // finish next run
  return {};
};
```

Delivery is at-least-once: a retried run that submits the same parameters while the first
attempt's capture is still in flight or cached gets the same `captureId` back — no duplicate task,
no duplicate quota.

### Using `parts` in messages and emails

`full` is one image of the whole page — fine in your own UI (scrollable), but a long page makes it
tens of thousands of pixels tall, which chat clients and mail clients shrink to unreadable or cut
off. **For anything sent out, use `parts`**: one image per segment, top to bottom.

- **Channel messages** (`ctx.pt.notify.send`): `imageUrl` also accepts heatmap image URLs captured by
  **this app in this workspace** (requires the platform release that ships `heatmap.capture`; before
  that only `ctx.pt.render.chart` URLs pass). It takes **one** image: use `parts[0].url` (the first
  screen), or `full.url` when the page is short (a single part); put links to the remaining parts in
  `text`, and use `link` to bring the reader back into your app.
- **Archives / reports** (the job's returned `archive.markdown`, or your own HTML email sent through a
  declared outbound host): embed the parts in order, one image per line
  (`![clickMap 1/3](parts[0].url)` …) so the page reads top to bottom.
- Remember the URLs expire (`expiresAt`, ~90 days) — older messages lose their images.

### Quotas

| Limit | Value |
| --- | --- |
| Newly rendered images per **workspace** per UTC day | **300** |
| Newly rendered images per **scheduled-job run** | **12** |
| Types per call | 1–4 |

Counted **per type**: one type's `full` + all its `parts` = 1 image; `heatmapTypes: ['clickMap', 'attentionMap']`
= 2. **Cache hits are free; failed tasks are not refunded.** Over the limit → `HEATMAP_CAPTURE_QUOTA_EXCEEDED`.
Capture what you will show, not every type "just in case".

### Call errors (`err.code` — the call itself was rejected)

| `err.code` | Meaning | Retry? |
| --- | --- | --- |
| `SCOPE_DENIED` | `analytics:read` not declared / not granted | No — fix scopes / get consent |
| `PROFILE_FORBIDDEN` | the calling user cannot access this profile | No |
| `CONSENT_UNAVAILABLE` | the consent check is unavailable | Later, not in a loop |
| `TOO_MANY_CONCURRENT_QUERIES` | throttled (too many captures in flight) | **Yes** — back off (`ctx.pt.heatmap` already retries a few times before throwing it) |
| `HEATMAP_NOT_ALLOWED` | free-plan profile and `url` is not the configured page (a `locked` row) | No |
| `HEATMAP_INPUT_INVALID` | bad `url` / `heatmapTypes` (0 or more than 4, unknown type) / `dateRange` / `deviceType` (incl. `TABLET`) | No — fix the input |
| `HEATMAP_CAPTURE_QUOTA_EXCEEDED` | daily (or per-run) quota used up | No — not today / not in this run |
| `HEATMAP_CAPTURE_NOT_FOUND` | `getCapture`: unknown `captureId`, or one of another app / workspace (indistinguishable) | No — drop the id |
| `HEATMAP_CAPTURE_UNAVAILABLE` | capture service temporarily unavailable | Later, not in a loop |
| `PT_TIMEOUT` | bridge only: no answer within 30 s | **Yes** — same params → same `captureId` |
| `PT_METHOD_NOT_ALLOWED` | bridge only: the host is older than the SDK | No — treat as unavailable |
| `PT_HEATMAP_CAPTURE_FAILED` | backend only: the gateway answered with no usable error (local fallback code) | Later |

`HEATMAP_FAILED` (from `createLink`) is not returned by `capture`. As elsewhere you may also see
`UNAUTHORIZED`, `SID_REQUIRED`, `INTERNAL_ERROR` and the bridge's other `PT_*` — keep a generic branch.

### Task failures (`cap.error.code` on `status: 'failed'` — the call succeeded)

| `cap.error.code` | Meaning | Retry? |
| --- | --- | --- |
| `TIMEOUT` | the renderer timed out on this page | **Yes** |
| `RATE_LIMITED` | the renderer is rate-limited right now | **Yes**, a bit later |
| `HEATMAP_CAPTURE_TIMEOUT` | the task stayed queued over 30 minutes or running over 15 minutes | **Yes** |
| `PAGE_NOT_ACCESSIBLE` | the renderer could not open the page | No |
| `CONTENT_ERROR` | the renderer hit an error with the page's content | No |
| `HEATMAP_NO_DATA` | no visits for this page / device / date range | No — change range / device |
| `HEATMAP_NO_BLOCK_CONFIG` | block / element types: the page has no blocks / elements configured | No — configure them in the product |
| `HEATMAP_NO_CONVERSION` | conversion types: no conversion bound to the page | No |
| `HEATMAP_CAPTURE_FAILED` | anything else | No |

A retry of a failed task is a new task and counts against the quota again — retry only the three
retryable codes, once or twice, not in a loop.
