# queryType `params` reference (Run-Query)

Each `queryType` has a deterministic `params` shape. Call
`Get-Query-Schema { queryType }` anytime for the authoritative, always-current
param schema — this file is the quick reference + notes. `profileId`: OAuth
callers pass it (omit for API-key callers, it's bound to the key).

## User queries

Single-user queryTypes take `{ userId, sessionId? }`. `user_journey` / `user_list`
take extra params (below).

| queryType | What it returns |
|---|---|
| `user_overview` | Aggregated profile summary for one user. |
| `user_timeline` | The user's last ~20 sessions. |
| `user_session_detail` | Event sequence inside one session. **Requires `sessionId`.** |
| `user_benchmark` | This user vs the site average. |
| `user_journey` | Full cross-session **event-level** timeline. Params: `{ userId, limit?, startDate?, endDate?, excludeEvents? }`. Defaults: last 3 years, `limit` 50000 (hard cap 50000), `excludeEvents` `["click","stay","engage_impression"]`. Returns `metadata.userList[].timeline`. |
| `user_list` | Population user **list** with search + pagination. Params: `{ search?, limit?, offset?, sortField?, sortDir? }` — **no `userId`**. `search` matches name/email (contains) + userId (exact) → covers "find user by email". Defaults: `limit` 50 (max 100), `offset` 0, `sortField` `pt:userLastActive`, `sortDir` `desc`. Returns columns + rows + `metadata.{total,hasMore}`. |

## Experience

### `experience_report`
WHOLE-experience totals (NOT split by version, NO uplift/win-rate) sliced by a
single `dimension`, as tabular `columns`/`rows`. Use for "experiment X's report /
overall performance / trend".

```json
{
  "experienceId": "exp_xxx",
  "timeRange": { "key": "lastDays", "days": 30, "include": true },
  "dimension": "device",
  "dimensionFilter": { "values": ["phone", "pc"] },
  "timeWindow": 1,
  "timeWindowUnit": "day",
  "filters": [{ "name": "sourceType", "op": "include", "value": ["SearchEngine"] }],
  "limit": 100
}
```

- `experienceId` **required** (name not accepted — resolve via `experience_search` / `List-Catalog(kind=experiences)`).
- `timeRange` optional — omitted defaults to the experiment's own run window.
- `dimension` optional, SINGLE group-by: `sourceType` / `sourceChannel` / `terminalType`(=`device`) / `visitType` / `visitPage` / `country` / `region` / `city` / `os` / `browser` / `resolution` / `utm*` / `sourceHost`, plus time buckets **`date` / `week` / `month`** (→ trend). Omit → one aggregate row.
- `dimensionFilter { values:[] }` — restrict the dimension to those values.
- `timeWindow` + `timeWindowUnit` — goal attribution window (default `1 day`).
- `filters[]` — report-wide scope `{ name, op:'include'|'exclude'|'contains', value:[] }`; unmapped names → `warnings`. User properties not supported here.
- `limit` (default 100) — Top-N groups.

> ⚠️ For an A/B WINNER analysis use `experience_abtest_report` (per-version rows +
> uplift + win-rate), NOT `experience_report` (whole-experiment only).

**Output** — `columns` + `rows` (one row per dimension value / time bucket, or one
aggregate row). Metrics: `viewUU`, `viewCount`, `clickUU`/`clickRate`/`closeUU`/`closeRate`,
`submitUU`/`submitRate` (forms), `avgSessionDuration` (ms), `avgPageViews`, `bounceRate`,
`pageClickRate` (clicks/PV, can exceed 1), `fvExitRate` (0-1), `avgPageDuration` (seconds),
plus per-goal `goalUU` / `goalRate`.

### `experience_search`
Search the experiment catalog by name / status / time. **The only queryType that
lists/filters experiments by metadata** — the other `experience_*` /
`experiment_attributed_funnel` all need a specific id/name.

```json
{
  "nameKeywords": ["検索", "経路別"],
  "statuses": ["RUNNING", "PAUSE", "ENDED"],
  "createdAfter": "2025-01-01",
  "createdBefore": "2026-05-25",
  "limit": 30
}
```

- `nameKeywords[]` — case-insensitive OR-match on name. Omit → no name filter.
- `statuses[]` (uppercase) — `RUNNING` / `PAUSE` / `DRAFT` / `ENDED` / …; omit → all.
- `createdAfter` / `createdBefore` (ISO date) — bound by first run time.
- `limit` (default 30, max 200).

Returns: `experience_name, experience_id, status, engage_type, first_run_time,
last_pause_time, create_time, version_count` (RUNNING first, then first-run DESC).
`metadata.{scanned, matched, returned}` distinguishes "filter excluded all" from "catalog empty".

### `experience_abtest_report`
Per-version × goal conversion + shared visit/page metrics + uplift / win-probability.
Shared metrics include visit-level (avg duration / avg PV / bounce) and page-level
(`pageClickRate`=clicks/PV can >1, `fvExitRate`=first-view exit rate, `avgPageDuration`).
`dimension` optional (same vocab as `page_insight`): omit → one row per version;
given → one row per (dimension value × version) + same metric columns + a leading
`dimensionValue` column (uplift/win-rate computed within each dimension-value group).

```json
{
  "experienceId": "exp_xxx",
  "timeRange": { "key": "lastDays", "days": 7, "include": true },
  "dimension": "terminalType",
  "dimensionFilter": { "values": ["phone", "pc"] },
  "filters": [{ "name": "country", "op": "exclude", "value": ["CN"] }],
  "subDimension": "country",
  "timeWindow": 7,
  "timeWindowUnit": "day",
  "limit": 20
}
```

- `dimension` — `sourceType`/`sourceChannel`/`terminalType`(=device)/`visitType`/`country`/`region`/`city`/`visitPage`/`utm*`/`userProperty`.
- `dimensionFilter {values:[]}` restricts the group-by values; `subDimension` nests a 2nd level (adds `subDimensionValue`); `userProperty` requires `userPropertyName`.
- `filters[]` — report-wide scope `{name, op:'include'|'exclude'|'contains', value:[]}`; unmapped → `metadata.warnings`.

### `experiment_attributed_funnel`
A **set** of experiments' attributed impact on an event funnel. Experiment exposure
is an **attribution gate** (before the funnel anchor); supports multiple experiments
+ first/last/all attribution.

**When**: the anchor is a **GOAL** (`steps[0]`), possibly multiple experiments, and
you want an **attribution model** ("these experiments' effect on login→cart→checkout"),
or the **people** of one transition (`mode=detail` + `detailTransitionIndex`).

```json
{
  "mode": "summary",
  "experienceIds": ["exp_a", "exp_b"],
  "steps": [
    { "goalId": "<anchor goalId, e.g. login>", "label": "anchor: login" },
    { "goalId": "<goalId of add-to-cart>" },
    { "goalId": "<goalId of checkout>" }
  ],
  "attributionModel": "all",
  "detailLimit": 500
}
```

- `mode` **required** — `summary` (per-step UV + conversion), `detail` (per-user convert/dropoff rows for ONE transition, ≤ `detailLimit`; identity column resolves email→name→userId), `timing` (inter-step elapsed avg/p50/p90).
- `steps[]` **required**, ≥2. Each is a **`goalId`** from this profile's goal catalog (`List-Catalog(kind=goals)`), NOT a raw event name. `steps[0]` is the funnel ANCHOR goal, NOT the experiment impression. Optional `label`.
- `experienceIds[]` **or** `experienceNames[]` — one required (ids win). Neither → error.
- `attributionModel` `first | last | all` (**default `all`**) — which exposure before the anchor counts. **`all` is the default and right for a single experiment.** `last`/`first` are for multi-experiment competition only.
- `timeRange` optional — omit → union of the experiment set's run windows.
- `conversionWindowSec` — max gap between consecutive steps.
- `conversionWindowDays` — cause→effect window in days: count users who saw the experiment during its run but converted after it ended.
- `detailLimit` (default 500) — row cap for `mode=detail`; `metadata.detail_truncated` flags the cap.
- `detailTransitionIndex` (**detail only**) — 0-based transition to list. Omit → last.
- `versionId` (**detail only**) — keep only users whose attributed exposure is this experiment **version** (`versions[].id` from `List-Catalog(kind=experiences)`).
- `byVersion` (**summary only**) — break down by the ATTRIBUTED version: one row per (version × step).

> **Anchor pitfall:** `steps[0]` is the funnel anchor GOAL, not the experiment
> impression. Keep goal/event names verbatim from the user; guessed names → 0 rows.

## Site-wide traffic

### `traffic_insight`
Whole-SITE performance — a FIXED bundle of **12 metrics**, optionally split by ONE
dimension, with optional goal conversion. Distinct from `page_insight` (a page set)
and from a single-metric free-form question (this always returns the 12-metric bundle).

```json
{
  "timeRange": { "key": "lastDays", "days": 7, "include": true },
  "dimension": "pt:visitSourceType",
  "dimensionFilter": { "values": ["SearchEngine", "SocialSite"] },
  "filters": [{ "name": "deviceType", "op": "include", "value": ["phone"] }],
  "conversions": ["<goalId>"],
  "userSegments": { "logic": "and", "conditions": [
    { "fieldCategory": "event", "field": "checkout_completed", "measureType": "totalEvent", "operator": "greaterThanOrEqual", "value": [1] }
  ] },
  "limit": 20
}
```

- **Metrics — fixed, always all 12** (caller does NOT pass `metrics`):
  - visit (6): `pt:visit`, `pt:visitNewUserRate`, `pt:visitBounceRate`, `pt:avgVisitDuration`, `pt:avgVisitPageview`, `pt:avgVisitPerUser`
  - user (1): `pt:user`
  - page (5): `pt:pageview`, `pt:pageClick`, `pt:pageClickRate`, `pt:pageFvDropoffRate`, `pt:pageExitRate`
- `timeRange` **required**.
- `dimension` optional — ONE visit dimension: `pt:visitSourceType` / `pt:visitSourceChannel` (finer channel, default for "channel" questions) / `pt:visitDeviceType` / `pt:visitCountry` / `pt:visitOs` / `pt:visitBrowser` / `pt:visitLandingPageUrl` / `pt:visitExitPageUrl` / `pt:visitAdCampaign` / `pt:date` / `pt:hour` / `pt:dayOfWeekName` / … Omit → whole-site single row.
- `dimensionFilter {values:[]}` — restrict the dimension. Use raw values (device `pc`/`phone`/`tablet`; `sourceType` ∈ `Direct`/`SearchEngine`/`Campaign`/`SocialSite`/`Referral`/`AISearch`; country English full name).
  - **Source/channel — pick the right field:** coarse class (organic search / paid / direct / social / referral / AI) → `sourceType` (organic=`SearchEngine`, paid=`Campaign`); generic "各渠道/各来源" → default `sourceChannel`; a specific ad/creative → `utmCampaign` / `utmContent`.
  - ⚠️ **Enumerate before filtering** if a value is a guess: `dimension: <that dim>` once to see real values (or `filters` with `contains`), then filter exactly — avoids "guess a value → 0 rows → retry" (e.g. organic guessed as `sourceChannel='Organic Search'` hits 0; correct is `sourceType='SearchEngine'`).
- `conversions[]` — goal IDs. Semantics = converters ÷ total active users; adds `conversion_base` + per goal `goal_{id}_count` / `goal_{id}_rate`. Session dims → per-value; time dims (`date`/`hour`/`dayOfWeek`) → site-wide in `metadata.conversionTotals` + a warning.
- `filters[]` — same shape as `page_insight.filters`; applied to BOTH metrics AND conversion so the base stays on the same filter. Session/visit-level only; page-scoped names skipped with a `metadata.warnings` note.
- `userSegments` — restrict the whole bundle + conversions to a cohort (same shape as `page_insight`, see notes).
- `limit` — Top-N cap (matters with high-cardinality dims like landing URL). Omit → all rows.

## Event

### `event_insight`
Event-grain behaviour: how often an event set fired, how many users, what share of
active users, plus optional event-property aggregations (SUM/AVG/…), optionally by
ONE dimension.

Fixed output columns: `event_count`, `unique_users`, `conversion_base` (active users
= distinct users with a session start in the window), `conversion_rate`
(= unique_users / conversion_base; a user whose session started before the window can
push it >1). One extra column per `aggregations` entry (`sum_price`, `avg_price`, …).

```json
{
  "timeRange": { "key": "lastDays", "days": 30, "include": true },
  "events": ["purchase"],
  "filters": [{ "name": "deviceType", "op": "include", "value": ["phone"] }],
  "aggregations": [
    { "property": "price", "method": "SUM" },
    { "property": "price", "method": "AVERAGE" }
  ],
  "dimension": "session_source_channel",
  "dimensionFilter": { "values": ["google", "direct"] },
  "limit": 20
}
```

- **Event scope** — `events[]` (exact names) AND/OR eventName filters `{"name":"eventName","op":"include"|"exclude"|"contains","value":[...]}`. Both omitted → ALL events (incl. system events) + a warning. Keep event names **verbatim**; guessed names → 0 rows.
- **`aggregations[]`** — `{property, method}`, `method` ∈ `SUM | AVERAGE | MAX | MIN | COUNT | DISTINCT_COUNT`. SUM/AVG/MAX/MIN cast to number; COUNT/DISTINCT_COUNT treat as string. Invalid method / empty property / duplicate → error.
  - ⚠️ **Confirm which event carries a property (varies per profile)** before aggregating — e.g. GMV may live on `checkout_completed.total_price`, not on `purchase`. Use `List-Catalog(kind=event_properties)` (`nameLike` accepts an array = OR, probe candidates in one call) instead of guessing.
- **`dimension`** (single group-by):
  - `userProperty.<key>` — a user attribute (rank / region / …); per-group conversion base is valid (see `### userProperty dimension`).
  - `eventProperty.<name>` — a custom event property. **Nested/array:** dot into a JSON value with `eventProperty.<name>.<a>.<b>`, or match an object-array field with `eventProperty.<name>[*].<field>` (e.g. `line_items[*].sku`). Deep paths extract via `get_json_string(CAST(value AS STRING), '$…')` so both JSON-string and native-array storage work; keys may contain `-`.
  - `event_name` / `pt:eventName` — per-event ranking.
  - page: `pv_cut_path`(`pt:pageUrl`) / `pv_full_path`(`pt:pageUrlWithQuery`) / `pv_title`(`pt:pageTitle`).
  - visit/session: `session_source_channel` / `session_device_type` / `session_country` / … (or `pt:visit*` aliases); plus `session_new_visit`(`pt:visitUserType`), `date`/`hour`/`day_of_week`, `social_platform`/`search_engine`, `landing_page`/`exit_page`.
  - omit / `"none"` → one aggregate row.
- **Conversion base**: raw `session_*` dims → per-group base; every other dim (eventProperty/event_name/page/time) → site-wide base (flagged in `metadata`).
- **`filters`** — same shape as `page_insight`; non-eventName filters scope numerator + base. **`userSegments`** — same shape.
  - ⚠️ **"a cohort's event behaviour" → `userSegments`, not `filters`/a 2nd event.** "cart_viewed count/UV of add-but-not-buy users" = `events:["cart_viewed"]` + `userSegments`(`product_added_to_cart` totalEvent≥1 AND `checkout_completed_merged` totalEvent<1). Stacking `filters:{name:"eventName",value:["product_added_to_cart"]}` makes one row = A and B → returns **0 with status:success**.
- **`dimensionFilter {values:[]}`** keeps only those values (needs `dimension`). **`limit`** → Top-N by `event_count`.
- **Not this**: ordered A→B→C funnel → `funnel_insight`; site KPI bundle → `traffic_insight`.

## Funnel

### `funnel_insight`
Ordered event funnel: per-step reached UV, adjacent conversion, overall funnel rate,
optionally split by ONE step-1-anchored dimension. Ordering is **loose** (each step
counts any time after the user's previous step; matching starts at the earliest step-1
occurrence in the window).

Output rows = (step × dim group): `step`, `label`, `[dim]`, `users` (reached UV),
`conversion_rate` (vs previous; step1 = 1.0), `cumulative_rate` (vs step1 — **last row
= overall funnel conversion**), `avg_from_prev_sec`, `avg_from_first_sec` (avg seconds
from previous step / from step1, over users who reached that step; **null at step1**;
equal in a 2-step funnel).

```json
{
  "timeRange": { "key": "lastDays", "days": 30, "include": true },
  "steps": [
    { "event": "product_viewed", "label": "view" },
    { "event": "product_added_to_cart",
      "filters": [{ "name": "eventProperty.category", "op": "include", "value": ["shoes"] }] },
    { "event": "checkout_completed_merged", "label": "purchase" }
  ],
  "dimension": "session_device_type",
  "dimensionFilter": { "values": ["phone", "pc"] },
  "filters": [{ "name": "sourceType", "op": "include", "value": ["SearchEngine"] }],
  "conversionWindow": { "value": 7, "unit": "day" },
  "limit": 10
}
```

- **`steps[]`** required, ≥2. Each: `event` (verbatim name — NOT a goalId; no resolver, guessed names → 0 rows), optional `label`, optional per-step `filters`.
- **Per-step `filters`** — two namespaces: registry field names (`pageUrl`→page path, `pageTitle`, `deviceType`, `sourceType`, `country`, `utm*`) + `eventProperty.<name>` for the step event's own properties (`include`→IN, `exclude`→NOT IN, `contains`→LIKE). Unknown / eventName-typed names → warning + skip.
- **`conversionWindow`** `{value, unit:'day'|'hour'}`, default `{7,'day'}` — the TOTAL step1→stepN elapsed cap.
- **`dimension`** (single) — anchored to the user's **step-1 entry**: session dims (`session_*` / `pt:visit*`), `session_new_visit`, `social_platform`/`search_engine`, `date`/`hour`/`day_of_week`; **page props** `pv_cut_path`/`pv_full_path`/`pv_title`; **`eventProperty.<name>`** (step-1 event); **`userProperty.<key>`**; and **`landing_page`/`landing_page_full`** (the landing page of the step-1 entry **session** — distinct from `pv_cut_path`, the step-1 event's own page). Page/event-property dims read the value at the user's earliest step-1 event; unset → `''` bucket. `exit_page` unsupported.
- **Top-level `filters` + `userSegments`** apply to the **step-1 scan only** (entry scope). ⚠️ Top-level `filters` is an **entry condition, NOT a per-step requirement** — it constrains only the step-1 session; later steps are counted in ANY context. This is exactly right for "avg conversion time of users FROM source X, conversion not limited to X" → put the source in top-level `filters` (e.g. `utmSource=facebook`), leave the conversion step unfiltered. To require a condition on a SPECIFIC step, use that step's own `filters`. Top-level `filters` also accept `eventProperty.<name>` (= step-1) and **`landingPage`** (keep users whose step-1 session landed on the URL — distinct from `pageUrl` which matches any page-view). (⚠️ pick the right source field — a specific ad usually lives in `utmSource`/`sourceChannel`, not the coarse `sourceType`; enumerate real values first.)
- **`dimensionFilter {values:[]}`** prunes dim groups; **`limit`** → Top-N by step-1 users.
- **Not this**: experiment-attributed funnels (goalIds + exposure gate) → `experiment_attributed_funnel`; single-event counts → `event_insight`.

## Path

### `path_insight`
Anchored path flow: from a page/event anchor, the Top-K nodes at each step — forward
("what did users do NEXT") or backward ("how did users ARRIVE"). The anchor is each
session's FIRST occurrence of the anchor page/event.

Output rows = (dim group × step × node): `step` (0 = anchor), `node` (page path or
event name — `metadata.anchorType` says which), `[dim]`, `pv`, `uv`, `rate` (uv ÷ that
group's anchor uv; step0 = 1.0), `rank`.

```json
{
  "timeRange": { "key": "lastDays", "days": 30, "include": true },
  "anchorType": "event",
  "anchor": "product_viewed",
  "direction": "forward",
  "depth": 5,
  "maxBranches": 5,
  "anchorFilters": [{ "name": "eventProperty.sku", "op": "include", "value": ["sku-1"] }],
  "filters": [{ "name": "deviceType", "op": "include", "value": ["phone"] }],
  "dimension": "session_source_channel",
  "limit": 5
}
```

- **`anchorType` + `anchor`** required. `page` → exact page URL; `event` → verbatim event name (no resolver — guessed → 0 rows). Page paths contain only page-view nodes; event paths span all events.
- **`direction`** `'forward'` (default) | `'backward'`. Backward: step 1 = the node just before the first anchor occurrence.
- **`depth`** default 5 (cap 20); **`maxBranches`** default 5 (cap 50) — per-step Top-K by uv.
- **event-mode noise control**: `excludeEvents` defaults to `['stay','scroll','session_start','session_end','engage_impression','click']`; pass `[]` to keep all. `includePageView` (default true). The anchor is never excluded.
- **`anchorFilters`** — anchor-row only. **`filters`** — node-scan scope. **`userSegments`** — user-level.
- **`dimension`** (single) — SESSION-CONSTANT only (session dims / `pt:visit*` / user_type / social_platform / search_engine). `date`/`hour`/`day_of_week` and `landing_page`/`exit_page` rejected. **`limit`** → Top-N dim groups.
- **Not this**: ordered A→B→C → `funnel_insight`; unanchored edges → `page_transitions`.

### `page_transitions`
Unanchored page→page one-hop adjacency — the edge set of a site Sankey: every adjacent
(source → target) pair with counts. Self-loops removed; session-final pages dropped.

Output rows = (dim group × edge): `[dim]`, `source`, `target`, `transition_count`
(desc), `source_pv`, `target_pv`.

```json
{
  "timeRange": { "key": "lastDays", "days": 30, "include": true },
  "filters": [{ "name": "pageUrl", "op": "contains", "value": ["/products/"] }],
  "dimension": "session_device_type",
  "minTransitions": 10,
  "limit": 500
}
```

- **`filters`** scope the page set / sessions; **`userSegments`** same as elsewhere. For visitor type use `filters:[{name:'visitType',op:'include',value:['new']}]`.
- **`dimension`** — same session-constant vocab as `path_insight`; edges split per group.
- **`minTransitions`** (default 5) prunes sparse edges; **`limit`** (default 1000, cap 10000) is GLOBAL across dim groups (narrow with `dimensionFilter`; truncation warned).
- **Not this**: anything anchored ("before/after page X") → `path_insight`.

## Landing-page

### `page_insight`
Page-level metrics for a PAGE SET, optionally grouped by ONE dimension.

- **Page set** — `pageUrls` (exact) **and/or** a `pageUrl` filter (`{"name":"pageUrl","op":"contains","value":["/pricing"]}`). At least one page scope required.
- **`dimension` — the SINGLE group-by key.** The param name is exactly `dimension`, value is ONE string (NOT an array, NOT `groupBy`). ⚠️ A wrong key or array value is **silently ignored** → you get one `All` row instead of the breakdown. Values: omit / `"none"` → one aggregate row; `"pageUrl"` → per URL; `device`/`sourceType`/`sourceChannel`/`utm*`/`visitType`/`week`/`date` → per value.
  - **Channel note:** `sourceChannel` = fine-grained channel (default when a question says "channel" without naming a field); `sourceType` = 6 coarse buckets.
- Output includes **`exitRate`** (exit-PV / PV; distinct from `bounceRate` / `fvExitRate`).
- **`conversions`** — an array of **goal IDs** (from `List-Catalog(kind=goals)`), NOT event names. Each adds `<goalName> Count` + `<goalName> Rate`. ⚠️ Passing an event name is **silently ignored**.
- **`userSegments`** — restrict every metric to a cohort (see notes). ⚠️ An unknown user-property field silently matches nobody (0 rows, no warning) — verify field names via `List-Catalog(kind=user_properties)`.

```json
{
  "pageUrls": ["https://example.com/a", "https://example.com/b"],
  "filters": [{ "name": "pageUrl", "op": "contains", "value": ["/pricing"] }],
  "timeRange": { "key": "lastDays", "days": 7, "include": true },
  "conversions": ["3941887a-ec17-4dc5-919e-777a2dd2ad0b"],
  "dimension": "device",
  "dimensionFilter": { "values": ["mobile"] },
  "limit": 20
}
```

### `page_block_metrics`
Block-level metrics — one row per **block × device**. Inherits `page_insight`'s params
**plus a required `deviceType[]`**.

```json
{
  "pageUrls": ["https://example.com/a"],
  "timeRange": { "key": "lastDays", "days": 7, "include": true },
  "deviceType": ["MOBILE"],
  "conversions": ["<goalId>"],
  "dimension": "sourceType",
  "limit": 20
}
```

- `deviceType[]` **required** — `PC` / `MOBILE` / `TABLET` (lowercase accepted). `ALL` or other → error. A device with no configured blocks → 0 rows silently.
- `dimension` / `dimensionFilter` optional — split each block by a session dimension.
- Output: `Landing Page, Device, Block, Screenshot, Impressions, Impression Rate, Exits, Exit Rate, Avg Stay Time` (+ per-goal Count / Rate).

### `page_element_metrics`
Per-ELEMENT impression/click/conversion for landing pages. Elements are the configured
clickable items inside blocks (associated to click events by selector).

```json
{
  "pageUrls": ["https://example.com/a"],
  "deviceType": ["MOBILE", "PC"],
  "timeRange": { "key": "lastDays", "days": 7, "include": true },
  "conversions": ["<goalId>"],
  "filters": [{ "name": "sourceType", "op": "include", "value": ["direct"] }],
  "limit": 50
}
```

- `pageUrls` + `deviceType` are ARRAYS (`PC`/`MOBILE`/`TABLET`). Element geometry is per-device.
- One row per CONFIGURED element with activity, per (URL × device): `pageUrl, deviceType, elementName, isCta, selectors, impressionNumber, impressionRate, clickNumber, clickRate` + per goal Count / Rate. Pages/devices with no configured elements → recorded in `metadata.issues`, not an error.
- Metrics: `impressionNumber` = PVs whose scroll reached the element; `impressionRate = impressionNumber / totalPV`; `clickNumber` = clicks matching the element; `clickRate = clickNumber / impressionNumber` (impression-based, NOT clicks/pv).
- `conversions` (goal IDs): each = "clicked this element, then completed the goal within 1 day".
- ⚠️ **No `dimension` param** (the only landing-page queryType without one). To see elements by user attribute, restrict with `userSegments` first.

## Notes

### Group-by dimension vs filter — counting semantics (all dimension queryTypes)

- **`funnel_insight`'s `dimension` = entry partition**: each user falls into ONE group by their earliest step-1 value (group counts sum to the total). Conversion rates are additive/interpretable.
- **Top-level `filters` (and `steps[].filters`) = existence**: keep rows matching the value, then take the earliest. The same user can match multiple values → **overlapping, not a partition**.
- So for the same value, a **dimension group's count ≠ the filter count** (dimension = classify-by-entry-value; filter = "ever had a step-1 at X"). This is by design for any dimension that varies across a user's multiple step-1s (session/landing/page/eventProperty/visitType). **Only `userProperty` is the exception** (a user-constant value → the two are equal). Want a strict "entry = X" partition → `dimension` + `dimensionFilter:[X]`; want "ever entered from X (overlapping)" → `filters`.
- **`traffic_insight` / `page_insight` / `event_insight` / `path_insight` / `page_transitions` dimensions are NOT partitions**: they group at session / PV / event grain, so a user active in multiple groups is de-duped **once per group** (group UVs sum to MORE than the site UV). **Do not sum group UVs to get the site UV.** Only `funnel_insight`'s dimension is one-user-one-group.

### Time range — unified `CalendarTimeRange` (all queryTypes)

```
timeRange: {
  key: 'today'|'yesterday'|'thisWeek'|'lastWeek'|'thisMonth'|'lastMonth'|'lastDays'|'custom'|'before'|'after'|'on',
  startTime?: 'YYYY-MM-DD',   // custom / after / on
  endTime?:   'YYYY-MM-DD',   // custom / before
  days?: number,              // lastDays
}
```

- End day is **inclusive**. "past 7 days" = `{ key:'lastDays', days:7 }`.
- Omit `timeRange` → each queryType applies its own default (page/user ≈ last 7/90 days; `experience_report` / abtest = the experiment run window; `user_journey` ≈ last 3 years).

### userSegments — cohort paradigm (all queryTypes that accept it)

`userSegments` (`UserSegmentDefinition`) restricts any queryType's metrics to a user
cohort; behaviour is consistent across `traffic` / `event` / `funnel` / `path` /
`page_transitions` / `page_insight`·`block`·`element`. A cohort is defined by
**behavioural events + user attributes**, so "viewed page X" / "added product Y" are
expressed as **event existence + nested `filters`**, not as a top-level page/event filter.

**When to use `userSegments` (vs a queryType's `filters` / `dimension` / `anchor`) — is the subject a group of users?**
- Subject is **people**: "*these users*' behaviour / profile / destinations / conversion" — even when the group is defined by a page/event/attribute (viewed page X, added product Y, rank=3, did event E on page P) → **`userSegments`**, then measure every metric on that cohort.
- Subject is a **data scope**: "*page X*'s performance", "*event E*'s count", "on *mobile*" → use `filters` / `dimension` / `anchor`, NOT `userSegments`.
- ⚠️ **Most-missed**: "users who did event E **on page P**" — the subject is USERS, cohort happens to be page+event → **must** be `userSegments` (event condition + nested page filter). Do NOT fake it with `page_insight`'s `pageUrl` filter — that's "all viewers of page P", a different set. `filters`/`anchor` scope page/event ROWS; `userSegments` scopes PEOPLE.

```
userSegments: { logic: 'and'|'or', conditions: [{
  fieldCategory: 'event', field: '<event name>',        // verbatim, e.g. page_view / product_added_to_cart
  measureType: 'totalEvent', operator: 'greaterThanOrEqual', value: ['1'],   // occurred ≥ N times
  filters: { logic:'and', conditions: [ <page/property filter on that event> ] }
}] }
```

- **Viewed page X** → `event: page_view` + nested `{fieldCategory:'pageProperty', field:'pt:pageUrl', operator:'equal'(exact)|'contains'(substring), value:[<url or substring>]}`.
- **Did an event with a property** (e.g. "added product Y") → `event: product_added_to_cart` + nested `{fieldCategory:'eventProperty', field:'pt:event#<prop>', operator:'equal', value:['<value>']}` (event-property field MUST be `pt:event#<prop>`; a bare `name` is **silently skipped**).
- **Exclusion** (did NOT do Y): add `negated:true` to the condition, or `totalEvent` with `<1`.
- To break a cohort down by an event-property value, use `event_insight` `dimension: eventProperty.<prop>`. Which event carries a property varies per profile — confirm via `List-Catalog(kind=event_properties)`.
- Operators align with the top-level filters: `equal/notEqual/in(=include)/notIn(=exclude)/contains/notContains/startsWith/endsWith/greaterThan…/between`.
- ⚠️ **Silent-skip trap**: an unsupported field/operator in a nested filter is dropped but still returns `status:success` with whole-site data → after adding a cohort, **verify the base/result actually shrank** (compare "with cohort" vs "without").

### userProperty dimension — group by a user attribute (all dimension queryTypes)

To **group** a metric by a user attribute (rank / family_member / region …), pass
`dimension: "userProperty.<key>"` — supported by the six queryTypes that have a
`dimension`: `event_insight` / `traffic_insight` / `page_insight` / `page_block_metrics`
/ `funnel_insight` / `path_insight`. (Free-form "group by rank" questions return
`UNSUPPORTED` — use the dimension instead.)

- **Syntax**: `dimension:"userProperty.rank"` (also accepts `pt:userProperty.rank`). The key is the user-property name, **verbatim**, varies per profile — confirm via `List-Catalog(kind=user_properties)`.
- **With a metric**: grouping is one axis, metrics come as usual. "客单价/GMV by rank" → `event_insight`, `events:["checkout_completed"]`, `aggregations:[{property:"total_price",method:"AVERAGE"}]`, `dimension:"userProperty.rank"` (amount is an **event property** `total_price`, not a user property).
- **Conversion metrics**: user attributes are user-constant, so each group's conversion base/rate is exact (unlike eventProperty dims which fall back to site-wide base).
- ⚠️ **v1 = string categories only** (exact-value grouping; numeric attributes sort lexically, no bucketing).
- ⚠️ **"(unset)" bucket**: users without the attribute fall into an empty-value group — many profiles have low coverage, so this bucket can be large; don't misread it as a real level.
- ⚠️ **Groups by CURRENT value** — a current snapshot of the user's attributes applied to historical events (same as `userSegments`), not the value at event time.
- ⚠️ **To FILTER by a user attribute → use `userSegments`, NOT `filters`.** `filters` do not recognize user properties — `filters:[{name:"rank",...}]` is **silently skipped and returns whole-site data** (only a warning). To see only rank=V users → `userSegments:{conditions:[{fieldCategory:"userProperty",field:"rank",operator:"equal",value:["V"]}]}`; to group by rank keeping some values → `dimension:"userProperty.rank"` + `dimensionFilter:{values:[...]}`.
- ⚠️ **Only `page_element_metrics` does NOT support it** — it has no `dimension`; restrict with `userSegments` first, then read elements for that cohort.
