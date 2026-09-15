# Querying Ptengine data from a Custom App

Two paths, one contract, one result shape `{ columns, rows, rowCount, metadata }`:

| Path | Where | Needs |
| --- | --- | --- |
| `await window.PtApp.data.query(req)` | browser, host-mediated | nothing beyond being loaded by the platform |
| `await ctx.pt.query(queryType, params)` | backend worker | a data scope in `manifest.scopes`, published and approved — otherwise 501 `PT_GATEWAY_NOT_BOUND` |

Use the backend path when you must join analytics with your own stored data, keep
person-level rows out of the browser, or post-process server-side. Use the bridge for
everything else — it is the only path that can `describe()` today.

Both run **as the calling user, in their workspace**: the profile/site is bound from the
verified session, never from a parameter, so code cannot widen the scope. The backend
path forwards the caller's App Token to the platform data gateway; public routes have no
token and therefore cannot query (401 `TOKEN_MISSING`).

Upstream error codes pass through verbatim, because each one is actionable:
`SCOPE_DENIED` (403), `TOO_MANY_CONCURRENT_QUERIES` (429), `UNKNOWN_QUERY_TYPE` (400).
Only an unparseable envelope degrades to `PT_QUERY_FAILED`.

## Set up the Ptengine MCP server first

The MCP server's `Run-Query` shares the same engine and contract
(setup: https://helps.ptengine.com/en/ai/mcp). Explore real events with `List-Catalog`,
validate the question with `Run-Query`, then port the params. The companion skill
`ptengine-mcp-analytics` (same marketplace) teaches the querying itself. A standalone
`npm run dev` front end returns placeholder data — never treat it as proof.

## Hard rules

1. **Param shapes are per-queryType — never write them from memory.** Call
   `await window.PtApp.data.describe()` for the enabled queryTypes plus their param JSON
   Schema; offline, read `node_modules/@ptengine/app-sdk/data-query.llms.txt` and
   `data-query.schema.json`. `ctx.pt.describe()` is **not open yet** and throws 501 —
   describe from the front end, then use the validated params in the backend.
2. **`timeRange` is a required object** on this surface:
   `{ key: 'lastDays', days: 7 }`, `{ key: 'thisMonth' }`, or
   `{ key: 'custom', startTime: '2026/08/01', endTime: '2026/08/20' }` (slash format;
   dates are cut in the **site profile's timezone**, not UTC or the browser's). Full key
   list: `today` `yesterday` `thisWeek` `lastWeek` `thisMonth` `lastMonth` `lastDays`
   `custom` `before` `after` `on`. Legacy string presets (`'last_7_days'`) still resolve
   server-side but fail type-checking — don't write them.
   ⚠️ **Porting from MCP**: for the aggregate queryTypes (page / traffic / event / funnel
   / path / page_transitions) only the time field differs — convert MCP's string preset or
   `customStart`+`customEnd` into the object form; everything else, funnel's
   `[{ event }]` steps included, moves verbatim. `experience_*` and `user_*` param sets
   **differ per surface** — rebuild those from `describe()`, never by copying MCP params.
3. **Never invent event or property names.** A name that does not exist returns 0 rows
   with no error. Resolve real names through MCP `List-Catalog` first.
4. **One analytics question = one query.** Group with `dimension` and read the table;
   never enumerate candidate values query-by-query (the fan-out anti-pattern).
5. **Queries are real analytics jobs** — seconds, sometimes minutes. Every call needs
   loading / error / empty states, and mount-time bursts get throttled
   (`TOO_MANY_CONCURRENT_QUERIES`). Cache results you will show again (KV in the backend,
   keyed per tenant; see `backend-runtime.md`).
6. **Read the envelope honestly.** `rows` is grouped detail, so summing rows does not
   produce a site total. The cap is **5000 rows**: when truncated,
   `metadata.truncated === true` and `metadata.totalRowCount` carries the real count —
   both fields are **absent** otherwise (not `false`/`0`). `rowCount` is always
   `rows.length`, never a grand total. `metadata.warnings`, when present, changes how the
   numbers should be read — surface it instead of dropping it.
7. `user_*` queryTypes return **single-person detail** (may include email and
   cross-session trails). Use them only when the question is about one person; operator
   dashboards use the aggregate types. Person-level rows are also the clearest reason to
   move a query to the backend.

## Normalizing two sources into one shape

An app that supports both paths (useful while a gateway binding is still being approved)
should convert each source into **one internal signal type immediately**, then share all
downstream code. Validate and narrow anything the browser posted to the backend — column
names allow-listed, row count capped, types checked — because a client-supplied result is
user input, not platform data.
