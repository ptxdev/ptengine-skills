# Tool reference (everything except Run-Query)

`Run-Query`'s per-`queryType` shapes are in [`query-types.md`](query-types.md)
(needed because one tool hides many shapes). Every tool below is a **separate,
self-describing MCP tool** — its exact input params AND return fields are in the
tool's own schema, so read the tool (or its `outputSchema`) for those. This file
only adds what the schema can't tell you: **when to use each, and which output
feeds which query param.**

Every tool takes `profileId` for OAuth callers (omit for API-key callers).

## Query & meta

- **`Run-Data-Query`** — free-form NL `question` fallback for anything no `queryType`
  covers (Mode B). Authoring rules + the anti-fan-out rule are in the main SKILL;
  returns the full `{ status, results, clarification?, error? }` envelope.
- **`List-Query-Types`** — see what `Run-Query` can do.
- **`Get-Query-Schema { queryType }`** — the authoritative, always-current param
  schema for one queryType. Prefer it over any doc when unsure.

## Discovery / lookup — resolve concrete ids · urls · names

Turn the user's words into the concrete value a query needs. Use them **to
disambiguate, not routinely**: for event / property / user-property NAMES you
normally pass the user's literal words and let the backend resolve them per profile.

All discovery/lookup below is ONE tool, `List-Catalog { profileId?, kind, params? }` —
`kind` picks the catalog; `params` is kind-specific (see the tool's own description).

| `kind` | Use it to… | Chains into |
|---|---|---|
| — (`List-Profiles`, separate tool) | match the user's site by name/domain (several matches → **ask**) | `profileId` on every other tool |
| `pages` | resolve "top pages" / a page named without a URL | its page-path field → `pageUrls` |
| `events` | confirm an event name before an event/funnel/path query | verbatim event name → `events[]` / `steps[].event` / `anchor` |
| `event_properties` | confirm **which event carries a property** (a GMV/amount field often lives on only one event, **varies per profile**) | property name → `aggregations[].property` / `eventProperty.<name>` |
| `user_properties` | confirm a user-property key (a wrong key silently matches nobody) | key → `dimension:"userProperty.<key>"` / a `userSegments` condition |
| `experiences` | disambiguate / browse experiments (the `experience_*` queryTypes also accept the **name** directly) | experiment id → `experienceId` |
| `goals` | **required** to get goal ids | `goal_id` → `experiment_attributed_funnel` `steps[]`/`conversions[]`, and `conversions` on `page_insight`/`traffic_insight` |
| `page_groups` | resolve a `page_group`-type goal's group id → the pages it matches | — |

## Two cross-tool patterns

- **`nameLike` takes a string OR an array (= OR-match).** `List-Catalog` with
  `kind=events` / `event_properties` / `user_properties` accepts
  `params.nameLike: ["purchase","order","checkout"]` — probe several candidate names in ONE
  call instead of guessing one at a time.
- **ids / urls → look them up first; names → pass the user's words verbatim** and let
  the backend resolve them (guessing a technical name returns 0 rows silently, not an
  error).
