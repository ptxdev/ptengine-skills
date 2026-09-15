# Run-Query queryTypes — semantic reference

**`Get-Query-Schema { queryType }` is the only source for parameters, enums and
defaults** — it matches exactly what `Run-Query` validates, and its
`resultColumns` name the output columns. This file deliberately contains **no
parameter listings**: it covers what the schema cannot tell you — counting
semantics, cross-type boundaries, and read-out gotchas. When this file and the
live schema disagree, the schema wins.

## Cross-type invariants (the aggregate types)

Applies to `page_insight` / `traffic_insight` / `event_insight` /
`funnel_insight` / `path_insight` / `page_transitions`:

- **Time window**: `timeRange` is a **string preset**
  (`last_7|14|30|60|90|180|365_days` | `today` | `yesterday`; default
  `last_7_days`, includes today) OR `customStart`+`customEnd` (`YYYY-MM-DD`,
  inclusive; overrides the preset). There is **no** this-week / last-month
  preset — express calendar windows with `customStart`+`customEnd`. The resolved
  window is echoed in `metadata.timeRange`.
  ⚠️ This is the **MCP surface**. A Custom App's `PtApp.data.query` takes an
  **object** `timeRange` (`{ key:'lastDays', days:7 }`, with a richer enum incl.
  thisWeek/lastMonth). Porting MCP params into app code is near-verbatim **for
  the aggregate types only** (convert the time field; the rest — funnel's
  `[{event}]` steps included — moves verbatim); `experience_*` / `user_*` param
  sets differ per surface — build those from the app's `data.describe()`.
- **Dimension vocabulary — write aliases, read canonical**: inputs accept
  aliases (camelCase, raw `session_*`, `pt:visit*`) and normalize them, but the
  **returned dimension column uses the canonical name**. Canonical vocab
  **differs per type** (`page_insight` is camelCase — `sourceChannel`, `device`,
  `visitType`; the others are snake_case — `source_channel`, `device_type`,
  `day_of_week`): take the exact list from `Get-Query-Schema` and read columns
  by those names, not by the alias you sent.
- **`dimensionFilter`** narrows the **grouped dimension** to a list of values and
  therefore **requires `dimension`** — it is not a page scope and not a
  row-level filter. It is available on the aggregate types including
  `page_insight` (whose page set still comes from `pageUrls` / a `pageUrl`
  filter) and on `experience_abtest_report`. Verify per type with
  `Get-Query-Schema`; don't infer parameters by symmetry.
- **`userSegments`**: `{ userSegmentId }` (saved segment, server-expanded
  against the current definition — preferred) or inline `{ logic, conditions }`.
  Combining several segments = list their `{ userSegmentId }` entries in
  `conditions[]`; the server **flattens** them, and a logic mismatch (an "or"
  segment with >1 condition merged into an "and") is an **actionable error**,
  never a silently wrong number.
- **`conversions`** (`page_insight` / `traffic_insight`): goal ids **and/or
  inline `{event, where?, aggregations?}` goals**. A bare event-name string is
  still not a goal — resolve ids via `List-Catalog(kind=goals)` or pass a real
  inline goal object.
- **Per-group conversion base**: `session_*` dims and time dims
  (`date`/`week`/`month`/`hour`/`day_of_week`) get a TRUE per-bucket base (a
  time bucket's base = users with a `session_start` in that bucket); other dims
  fall back to the site-wide base — flagged in `metadata.warnings`.
- **`metadata.warnings` is load-bearing**: skipped filters, unmeasured goal
  columns, truncation, degraded bases all land there. Read it on every result;
  if non-empty, reflect it in your answer.
- **null ≠ 0**: a `null` metric means "not measurable here" (e.g.
  `page_insight` `bounceRate` / `pageViewsPerVisit` for a page never used as an
  entry page; goal columns whose conversion query couldn't run). A `0` is a
  real, measured zero. Never present null as zero.

## Per-type notes (when to use / read-out gotchas)

### traffic_insight
Whole-site KPI bundle (fixed 12 metrics), optional ONE dimension. Output columns
are snake_case: `sessions, new_user_rate, bounce_rate, avg_session_duration,
avg_session_pageview, avg_sessions_per_user, user_count, page_view_count,
page_click_count, page_click_rate, first_screen_churn_rate, exit_rate` —
**`avg_session_duration` is milliseconds**.

### page_insight
Page-set metrics. A page scope is required (`pageUrls` and/or a `pageUrl`
filter). `dimension` omitted → ONE aggregate row; `"pageUrl"` → per URL; other
dims collapse URLs. Gotchas: `clickRate` = clicks/pv, average click events per
PV — **can exceed 1** (matches the product heatmap report, not a clicked-PV
percentage); `bounceRate` ≠ `exitRate` ≠ `fvExitRate` (landed-session bounce vs
exit-PV/PV vs first-screen exit); **`limit` is a correctness parameter, not
paging** — pass it explicitly so every returned row has fully measured goal
columns (omitted → tail rows may show unmeasured 0s, reported in warnings).

### event_insight
Event counts / event-property aggregations, optional ONE dimension. Fixed
columns `event_count, unique_users, conversion_base, conversion_rate`
(`conversion_base` = active users with a `session_start` in the window;
`conversion_rate` **can exceed 1** when old sessions span the window).
`events[]` takes **verbatim event names** (this channel does not resolve
business terms); omitting `events` = ALL events (+ warning). `aggregations`
produce columns named `<method>_<property>` (e.g. `sum_total_price`). Rows are
sorted by `event_count` desc, **not by time** — re-sort time dimensions yourself.

### funnel_insight
Ordered (loose-sequence, user-level, earliest-forward) event funnel.
**`steps` is an array of OBJECTS** `[{ event, label?, filters? }]` (≥2; `event`
is the verbatim event name; per-step `filters` are supported) — plain strings
are **rejected** ("expected object, received string"); `Get-Query-Schema` now
renders `steps.items` as `object` accordingly.
`conversionWindow` bounds the TOTAL step1→stepN time (default 7
days), not the gap between adjacent steps. Read-out: the `step` column is the
**string** `"step1"`/`"step2"` — strip the prefix before sorting numerically
(`Number("step1")` is NaN; lexicographic order puts step10 before step2);
step1 rows have `conversion_rate` 1.0 and `avg_*_sec` null; the last row's
`cumulative_rate` is the overall funnel conversion.

### path_insight / page_transitions
`path_insight`: anchored multi-hop flow; the anchor is the **first occurrence
in a session**; `step` 0 = the anchor; `rate` = that node's uv ÷ the group's
anchor uv. Event mode drops a default noise set (`excludeEvents`; `[]` keeps
all) and includes page_view nodes by default. `anchorFilters` scope the anchor
row; `filters` scope every node. `page_transitions`: anchor-less one-hop
page→page adjacency (session LEAD pairs) — use for site-wide top transitions /
Sankey edges only.

### page_block_metrics / page_element_metrics
Block-level heatmap metrics for ONE landing page (bucketed by device) /
element-level impression + click (+ optional goal conversion) for a page set.

### experience_* / experiment_attributed_funnel
- `experience_search`: search the experiment catalog (no Doris) — name, id,
  status, time metadata.
- `experience_report`: WHOLE-experiment totals — no per-version rows, no uplift.
- `experience_abtest_report`: per-version × goal + uplift/win-rate; add
  `dimension` for by-device/country slices. ⚠️ The default output is **formatted
  display strings** (`"12.3%"`) — pass `valueFormat:'raw'` (numbers + a leading
  `versionId` column) before doing ANY arithmetic, sorting, or charting
  (`valueFormat` exists on this queryType only — the other types have no such param). Goal
  columns are **dynamically named** `<goalName>-goalUU` / `-goalRate` /
  `-uplift` / `-probabilityToBeBest`; `avgSessionDuration` is milliseconds.
- `experiment_attributed_funnel`: a SET of experiments' attributed impact on a
  funnel. `steps` are objects: each needs a **goalId** (preferred — resolve via
  `List-Catalog(kind=goals)`) **or a verbatim `event`**; goalId wins when both
  are set. `attributionModel` defaults to **`all`** (the user saw ANY experiment
  in the set before the anchor — right for a single experiment or the set as a
  whole); pass `first`/`last` only when several experiments contend for the same
  conversion and you need touchpoint-specific credit.

### user_* (single-user & catalogs)
`user_overview` / `user_timeline` / `user_session_detail` (needs `sessionId`) /
`user_benchmark` / `user_journey` (cross-session event-level) take a `userId`.
`user_list` searches/paginates the user population (no `userId`; `search`
matches name/email contains + userId exact — covers "find user by email").
`user_segment_search` lists/searches saved segments and returns each segment's
id + condition tree (pass as `userSegments` on aggregate types). These return
per-person detail (may include email) — use only when the question is about a
specific person. `user_benchmark` runs an LLM-backed pipeline internally (don't
call it in loops) and its columns are **generated per question** — the one
exception to reading columns by known names: interpret them via
`metadata.column_meta` / `sql_description`. `userSegments` among these types:
only `user_list` takes it (to LIST a cohort's members, AND-combined with
`search`); the other `user_*` and all `experience_*` types do not.
