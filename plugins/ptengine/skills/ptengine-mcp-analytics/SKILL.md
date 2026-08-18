---
name: ptengine-mcp-analytics
description: How to query Ptengine analytics well through the Ptengine MCP server — pick the right tool (Run-Query queryType vs Run-Data-Query free-form), resolve names/ids first, author atomic questions, avoid the fan-out anti-pattern, and parse the returned {columns, rows} envelope. Use whenever the user asks about their Ptengine site's visits, events, funnels, user paths, experiments, landing pages, or individual users.
---

# Ptengine Analytics Query (MCP)

You are connected to the **Ptengine MCP server**. It answers analytics questions
about a Ptengine **profile** (one site/workspace). You do NOT write SQL — the
tools and backend do that. This skill tells you HOW to call the tools well and
HOW to read what comes back.

If the `Run-Query` / `List-*` tools aren't available, the Ptengine MCP server
isn't connected — point the user to the setup guide: https://helps.ptengine.com/en/ai/mcp

## Tools you have

| Tool | Use for |
| --- | --- |
| `Run-Query` | **Preferred.** Run a typed **queryType** by `queryType` + `params` — deterministic, reproducible. |
| `Run-Data-Query` | **Fallback.** One free-form natural-language `question` when no queryType fits. (May be gated off for some accounts.) |
| `List-Query-Types` | List every `queryType` + a one-line summary. |
| `Get-Query-Schema` | Get one `queryType`'s exact params (JSON Schema) + notes. **Call this before Run-Query when unsure of params.** |
| `List-Profiles` | List profiles you can access (to resolve/disambiguate `profileId`). |
| `List-Catalog { kind }` | Discover concrete pages / events / properties / experiments / goals / page-groups for a profile — one tool, `kind` = `pages`\|`events`\|`event_properties`\|`user_properties`\|`experiences`\|`goals`\|`page_groups`. |

> Deep reference: `Run-Query`'s per-queryType shapes → [`references/query-types.md`](references/query-types.md); every other tool's params / returns / usage → [`references/tools.md`](references/tools.md).

### profileId
- **OAuth callers:** pass `profileId`. If the user names a site or you're unsure, call `List-Profiles` first and match by name/domain; if several match, **ask the user** — never guess.
- **API-key callers:** omit `profileId` — it's bound to the key.

## Two modes — try a queryType FIRST

**Mode A — `Run-Query` with `queryType` + `params` (reach for this first).**
A `queryType` is a typed, deterministic shortcut for a common analytics domain. Check the
decision rubric below; if the question fits, use `Run-Query`. Call `List-Query-Types`
to see all. **Each queryType's params, examples, output columns, and counting notes
are in [`references/query-types.md`](references/query-types.md)** — read that for the
shape; `Get-Query-Schema { queryType }` is the authoritative, always-current source.

**Mode B — `Run-Data-Query` with a free-form `question` (fallback).**
For general "[metric] by [one dimension], [filter], Top-N, [time window]" questions,
trends, or cohorts that no queryType covers. Pass ONE atomic `question`.

> A **cohort restriction** ("users who did / didn't do X", a membership/rank) is NOT
> a reason to go free-form — most queryTypes accept a `userSegments` cohort param.
> Reach for the queryType + `userSegments`, not a free-form question.

## Decision rubric (first match wins → `queryType`)

1. **One named user** (userId / email / device_id)? → `user_overview` / `user_timeline` / `user_session_detail` / `user_benchmark` / `user_journey` (cross-session event journey).
2. **List / search the experiment catalog** (by name, status, time)? → `experience_search`.
3. **A specific experiment / A-B test by name or id?**
   - A/B winner / uplift / 胜率 (per-version × goal, add `dimension` for by-device/country) → `experience_abtest_report`.
   - Whole-experiment overview / trend (no per-version rows) → `experience_report`.
   - A SET of experiments' attributed impact on an event funnel → `experiment_attributed_funnel`.
4. **A landing-page URL / page set's performance?** → `page_insight` (page KPIs, optional groupBy + `userSegments`), `page_block_metrics` (per block), `page_element_metrics` (per element).
5. **Whole-site KPI overview** (visits / users / pageviews / bounce … as a bundle, optional 1 dimension, optional cohort)? → `traffic_insight`.
6. **Event behaviour** — how often event X fired / how many users / conversion rate / SUM·AVG of an event property, optionally by ONE dimension? → `event_insight`.
7. **Ordered multi-step funnel** (A→B→C, per-step drop-off, step timing)? → `funnel_insight` (verbatim event steps).
8. **Anchored path** — "where did users go / what did they do AFTER X" (or how they ARRIVED at X → `direction:'backward'`)? → `path_insight`.
9. **Unanchored page-to-page flow** — site-wide top page transitions / Sankey edges? → `page_transitions`.
10. **None of the above** — general "[metric] by [1 dimension], [filter], Top-N, [window]" / trend / cohort with NO named experiment → fall back to ONE `Run-Data-Query` question.

Always `Get-Query-Schema { queryType }` if you're unsure of a queryType's params.

## Resolve concrete ids / urls FIRST (then query)

Some questions need a concrete id/url before you can query:
- **named experiment** → the `experience_*` queryTypes accept the experiment **name** directly, so lookup is usually optional. Use `List-Catalog(kind=experiences)` only to disambiguate.
- **goal / conversion point** ("予約" / "サンクスページ") → `List-Catalog(kind=goals)` for its `goalId`. **Required** for `experiment_attributed_funnel` steps/conversions (they take goalIds, not names).
- **"top pages" / a page named without a URL** → `List-Catalog(kind=pages)` for the `pageUrls`.

Rule of thumb: **ids / urls → look them up first; event / property / user-property NAMES → pass the user's words** (see next section). Only use `List-Catalog(kind=events|event_properties|user_properties)` to disambiguate — not routinely.

## Never invent event / property / user-property names

When the question references a Ptengine event (`购买` / `加购` / `checkout`), an event
property (`商品 title` / `订单金额`), or a user property (`会员等级` / `LTV`), use the
user's **literal wording**. Do NOT translate to a technical event_name / property key —
the backend resolves those per profile. Guessing wrong returns **0 rows silently**, not
an error. Don't convert units either (leave `LTV > 10000 円` verbatim).

## Authoring an atomic free-form question (Mode B) — four slots

- **Time range** — explicit (`过去 7 天` / `2026-05-01 ~ 2026-05-18`). Never omit.
- **One metric** — exactly one (`UV`, `订单数`, `购买金额总和`).
- **One dimension OR one filter** — one target axis, not a branch.
- **Limit** — explicit (`Top 20`; default ≤ 50).

Template: `[时间范围] 内，[筛选条件] 的 [实体]，按 [维度] 统计 [指标]，取 Top [N]，按 [指标] 倒序。`

Never put `如果没有 X 则 Y` fallbacks, `or`/`either` branches, multi-step user
transitions, or ≥2 metrics in one question — one gets silently dropped. Split into
multiple calls and join client-side.

## ⚠️ The #1 anti-pattern: one analytical question = ONE query

**Never enumerate candidate values and probe each with its own query.** "Which pages
did converting users view", "which products did segment X buy", "top events for cohort
Y" are each **ONE group-by query over that dimension, filtered to the cohort** — the
backend returns the whole ranked list in one call.

- ✅ "过去 90 天转化用户浏览了哪些页面" = **one** query:
  `Run-Query event_insight` with `events:['page_view']` + `dimension:'pv_cut_path'` +
  `userSegments` (the cohort who fired the conversion goal). Or one Mode-B question:
  `过去 90 天内，触发过 checkout_completed 的用户，按页面路径统计 PV，取 Top 20，按 PV 倒序。`
- ❌ Do NOT fetch a list of pages/products, then fire one query per item ("…on page 1?",
  "…on page 2?", …). That's dozens of slow calls that never converge and freeze the chat.
- Likewise **never fan a queryType out once-per-dimension-value**, and **"what values
  does dimension/property X have / its distribution / Top-N"** is itself just a
  `dimension` group-by (one call returns all values + counts) — not a probing loop.

**Filter vs group-by a user property:** to **group** a metric by a user property use
`dimension: "userProperty.<key>"`; to **filter** to a cohort (only rank=V users) use
`userSegments` — NOT `filters` (filters ignore user properties and silently return
whole-site data).

**Budget:** one user question should take **≤ 3–4** tool calls (a lookup or two, then
the query). If you're about to exceed that, you've mis-decomposed — re-express as a
single group-by query. Never loop. Run at most **3** queries in parallel.

## Reading what comes back

Both tools return a JSON payload (in the tool result text). Shapes:

**`Run-Query` — success:** the query result directly:
```json
{ "columns": ["pv_cut_path", "pv"], "rows": [["/a", 1200], ["/b", 800]] }
```
**`Run-Data-Query` — success:** the full envelope:
```json
{ "status": "success", "results": [ { "columns": [...], "rows": [[...], ...] } ] }
```

Parsing rules:
- **`rows` is a 2-D array** (`any[][]`), aligned to `columns` by index. Read column `X`
  as `row[columns.indexOf("X")]` — do NOT assume a fixed position or object keys.
- **Do NOT sum the dimension rows to get a total** — a group-by result's rows are the
  breakdown, not a total. If you need the total, request it as its own query.
- Some results carry extra fields (e.g. `sql`, metadata) — ignore them for parsing.

**Clarification** (mainly `Run-Data-Query`): `status: "clarification"` with a
`clarification.question` + `clarification.options`. **Forward the options to the user
verbatim — never pick for them.** On the user's choice, re-call with that value.

**Errors:** `{ "error": { "code", "message" } }` (or `status: "error"`). Branch on `code`:
- `INVALID_PARAMS` → the error carries `issues` (what's wrong, per field) + `acceptedParams` (the exact shape inline). **Fix your params to match and retry once yourself** — don't call `Get-Query-Schema` first, and don't bounce it to the user.
- `INVALID_QUESTION` → ask the user to rephrase (free-form Mode B couldn't parse the question).
- `UNSUPPORTED_QUESTION` → no queryType fits and free-form is off; rephrase toward a supported shape or a queryType. Don't retry as-is.
- `EVENT_NOT_MAPPED` → an event/term wasn't recognized; confirm the name with the user (or `List-Catalog(kind=events)`) and retry.
- `UNKNOWN_METRIC_ID` / `UNKNOWN_DIMENSION_ID` → the metric/dimension name is wrong; confirm and retry.
- `EXPERIENCE_NOT_FOUND` / `EXPERIENCE_AMBIGUOUS` → confirm the experiment name/id (`List-Catalog(kind=experiences)`).
- upstream / timeout categories (service busy, timed out) → at most ONE cautious retry.
- Anything else → report the message to the user plainly, in their language; don't loop.

Read a queryType's exact params anytime with `Get-Query-Schema { queryType }` — it is the
source of truth and never goes stale.
