# Listing and opening heatmaps from a Custom App

Two steps, the same ones the product's heatmap app takes: **list** the pages with the
`heatmap_page_list` queryType, then **open** one page's heatmap overlay (or just generate its link)
with `PtApp.heatmap`. Both run **as the calling user** and apply the same free-plan heatmap quota as
the product's heatmap list.

| Step | Where | Needs |
| --- | --- | --- |
| List | `PtApp.data.query({ queryType: 'heatmap_page_list', … })` — also `ctx.pt.query('heatmap_page_list', …)` from a backend, same rows | `analytics:read` in `manifest.scopes` |
| Open / link | `window.PtApp.heatmap.open / createLink` — **Bridge only** (`@ptengine/app-sdk` ≥ 2.9.0); there is no backend equivalent | `analytics:read` in `manifest.scopes`; feature-detect with `if (PtApp.heatmap)` — an older host has no `heatmap` |

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
- Input: `url` — a `heatmap_page_list` row's `url`, or any page URL of this profile;
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

The list is not exhaustive: keep a generic fallback branch for anything else, including the
bridge's own `PT_*` errors. Like `data.query`, heatmap calls have **no client-side timeout** — show
a loading state.

## Hard rules

1. **Call `open` directly inside the click handler**, before awaiting anything else: browsers only
   allow a new tab while the click's user activation is still valid. Don't fetch the list, a token
   or anything else between the click and `open`.
2. **On `PT_POPUP_BLOCKED`, fall back to `createLink`** and show the link for the user to click —
   never retry `open` in a loop.
3. **Don't offer an open action on `locked` rows** — show them as locked (the product greys them
   out); opening one fails with `HEATMAP_NOT_ALLOWED`.
4. **The link only works for signed-in members of the workspace.** Don't present it as a shareable
   public link, and don't send it to people outside the workspace.
5. List pages with `heatmap_page_list` — don't rebuild the list from `page_insight`: that misses the
   heatmap quota (`locked`, `quotaLimited`) and the product's ranking.
