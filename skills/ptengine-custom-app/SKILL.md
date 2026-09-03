---
name: ptengine-custom-app
description: How to build, debug, package, and publish a Ptengine Custom App — a static front-end bundle that runs inside the Ptengine platform in a sandboxed iframe and talks to the host through window.PtApp (context, ui, nav, data.query). Use whenever the user wants to create a custom app, dashboard, or tool that lives inside Ptengine, extend Ptengine with their own functionality, or asks how to package/upload/publish an app bundle to Ptengine. 中文触发词：Ptengine 自定义应用 / 自定义 App / Ptengine 插件 / 应用上传 / 应用市场。
---

# Building a Ptengine Custom App

You are building a **pure static front-end bundle** (HTML/JS/CSS, zipped) that the
Ptengine platform loads in a **sandboxed cross-origin iframe**. No backend, no SSR,
no secrets in the bundle (it is publicly fetchable). All host capabilities come from
one bridge object: `window.PtApp`. Most mistakes here **fail silently** (blank page,
missing styles, empty data, no error) — follow the rules instead of iterating on symptoms.

## The workflow (do these in order)

1. **Scaffold** from the official starter (below) — requires Node 20+.
2. **Read `AGENTS.md` in the scaffolded project** (explicit action: open and read
   the file). It is the authoritative build guide; this skill is the operating
   summary. Generated files inside `@ptengine/app-sdk` outrank both.
3. If the app queries Ptengine data: **set up the Ptengine MCP server first** and
   validate every query there before writing code (see "Querying data").
4. Before writing UI, **read `node_modules/@ptengine/design-components/llms.txt`**
   (explicit action) — component list and design rules.
5. Build the app. Keep the bootstrap invariants below intact.
6. **Package and verify**, then hand the zip to the platform admin flow ([`references/publish-and-operate.md`](references/publish-and-operate.md)).

```bash
git clone https://github.com/ptxdev/ptengine-app-starter.git my-app
cd my-app && rm -rf .git && npm install && npm run dev
```

## Bootstrap invariants (the starter ships exactly this — preserve its shape)

```tsx
// src/main.tsx (condensed from the starter — do not restructure)
import { installDevHost } from '@ptengine/app-sdk';
import '@ptengine/design-components/styles/tokens.css';
import { getPtApp } from './pt-app';                    // starter-local helper, keep it
import { applyPtTheme, followPtTheme } from './theme';  // starter-local file — don't recreate

async function bootstrap() {
    if (import.meta.env.DEV) await installDevHost();    // dev-only guard is CORRECT, see below
    const app = getPtApp();
    if (app) followPtTheme(app); else applyPtTheme('light');
    createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
bootstrap();
```

- **Why the DEV guard is safe in production**: at upload time the platform injects a
  blocking SDK loader into the bundle's `<head>`, so `window.PtApp` exists before app
  code runs. The `await` matters in dev-inside-platform mode (the SDK arrives over the
  network) — removing it leaves that mode permanently on "PtApp not detected".
- **`PtApp` ready ≠ `context` ready**: until the host handshake lands,
  `context` is an **empty object** — treat every context field as possibly absent.
  Never branch on `context.sid/locale/theme` read once at first render — subscribe
  with `app.on('context', cb)` (what `followPtTheme` does). `ui.*` / `nav.*` calls
  before the handshake are queued, not lost. `on()` returns **no unsubscribe** —
  guard stale callbacks with your own flag (see starter `theme.ts`).
- **Routing**: the starter ships no router. If you add one, hash only
  (`createHashRouter` / `<HashRouter>`) — the entry URL is
  `.../<appId>/<versionId>/index.html`, so `history.pushState('/x')` escapes the app.
  Reflect internal pages with `nav.syncRoute('detail')` (from a route effect); it
  returns as `context.initialPath` next entry.

## Hard boundaries (violations fail without errors)

| Rule | Symptom if broken |
| --- | --- |
| Keep `base: './'` in `vite.config.ts` | Blank page on platform (assets 404), fine locally |
| `manifest.json` at the **zip root**; `entry` matches built entry | Upload rejected: `MANIFEST_MISSING` / `ENTRY_NOT_FOUND` |
| Host capabilities only via `window.PtApp` — dialogs via `ui.toast/confirm`, never native `alert()`/`confirm()` | Anything else is platform-internal and will change; native dialogs are unreliable in the sandbox |
| Only static file types in the zip (html/js/css/images/fonts/json) | Upload rejected |

## The bridge: window.PtApp

```ts
window.PtApp = {
  version, context: { appId, sid, locale, theme, initialPath },
  ui:   { toast(message, type?), confirm({ title?, message }) },  // confirm → Promise<boolean>, await it
  nav:  { push(path), syncRoute(subPath) },
  data: { query(req), describe() },
  on(event, cb)
}
```

- `context.locale` is `zh-CN` | `en-US` | `ja-JP`; `theme` is light/dark;
  `initialPath` restores deep links.
- `context.sid` identifies the site — **display/cache-key use only; never put it
  into query params** (the server binds the profile from the session, not from you).
- `nav.push` accepts platform-internal relative paths only. Unless you know an
  exact platform target path, **use `syncRoute` and stay inside the app**.
- `on()` has exactly three events — do not invent others:

| Event | Payload | What to do |
| --- | --- | --- |
| `'context'` | the full new `PtAppContext` | re-apply locale/theme if changed (diff before touching DOM) |
| `'route'` | `{ subPath }` | navigate your internal router |
| `'overlay.click'` | none | close your own open overlay/drawer |

**Storage**: `localStorage`/`indexedDB` work, but the sandbox origin is **shared by
every custom app** — prefix keys with `context.appId`; never store secrets or
personal data. There is no other persistence.

## Querying data (PtApp.data) — set up Ptengine MCP first

The platform executes queries server-side with the viewer's session. **Before writing
any `data.query` code, recommend the user connect the Ptengine MCP server** (setup:
https://helps.ptengine.com/en/ai/mcp): its `Run-Query` shares this contract and
engine — explore real events via `List-Catalog`, validate with `Run-Query`, then port
the params (within rule 2's porting scope). The companion skill
`ptengine-mcp-analytics` (same marketplace) teaches querying. Standalone dev returns
placeholder data — never treat it as proof of correctness.

```ts
const res = await window.PtApp.data.query({
  queryType: 'funnel_insight',
  params: { timeRange: { key: 'lastDays', days: 7 },
            steps: [{ event: 'page_view' }, { event: 'purchase' }] }
});
// res = { columns: string[], rows: unknown[][], rowCount, metadata }
```

Hard rules:

1. **Param shapes are per-queryType — never write them from memory.** Call
   `await window.PtApp.data.describe()` (all enabled queryTypes + param JSON Schema);
   offline, read `node_modules/@ptengine/app-sdk/data-query.llms.txt` + `data-query.schema.json`.
2. **`timeRange` is a required object**, e.g. `{ key: 'lastDays', days: 7 }` or
   `{ key: 'custom', startTime: '2026/08/01', endTime: '2026/08/20' }` (slash
   format; dates cut in the **site profile's timezone**, not UTC/browser). Full
   key list in the schema. Legacy string presets (`'last_7_days'`) — don't write them.
   ⚠️ Porting from MCP: for the **aggregate** queryTypes (page/event/traffic/
   funnel/path/page_transitions) only the time field differs — convert MCP's string
   preset / `customStart`+`customEnd` to this object form; the rest (funnel's
   `[{ event }]` steps included) moves verbatim. `experience_*` / `user_*` param
   sets **differ per surface**: build them from `data.describe()`, never by
   copying MCP params. (This SDK's `timeRange` enum also has the thisWeek/lastMonth
   calendar presets MCP lacks.)
3. **Never invent event/property names** — wrong names return 0 rows silently.
4. **One analytics question = one query**: use `dimension` for a grouped table;
   never enumerate candidate values query-by-query.
5. **Queries are real analytics jobs** (seconds, sometimes minutes): every query
   needs loading / error / empty states, and don't burst concurrent queries on
   mount — the host throttles (`TOO_MANY_CONCURRENT_QUERIES`).
6. `rows` is grouped detail — don't sum rows to fake a total. Cap is **5000
   rows**: when truncated, `metadata.truncated === true` + `metadata.totalRowCount`;
   absent otherwise. `rowCount` is `rows.length`, never a total.

`user_*` queryTypes return single-person detail (may include email) — dashboards use aggregate types.

## UI

Use `@ptengine/design-components` exclusively (no antd/MUI/chakra, no hand-rolled
controls); take component/variant names from its `llms.txt`, never from memory.
Keep the starter's four wirings intact (Tailwind preset, `content` glob into the
package `dist`, `tokens.css` import, `pt-ui` class on `<html>`). Use semantic
classes (`text-foreground`, `bg-secondary`, …), never hardcoded colors; `className` is layout-only.

## Diagnosis: symptom → likely cause

| Symptom | Likely cause |
| --- | --- |
| Blank page on platform, works locally | `base: './'` changed in `vite.config.ts` |
| "PtApp not detected" forever — only in platform dev mode | the `await` around `installDevHost()` was removed |
| Theme/locale never follows the platform | branched on `context` read once at first render — subscribe `on('context')` |
| Click navigates the whole platform away / 404 | history routing instead of hash |
| Query returns 0 rows, no error | event/property name doesn't exist — verify via MCP `List-Catalog` |
| Query worked in MCP but fails/empties in the app | params drifted while porting — follow rule 2's porting scope (aggregate types verbatim except `timeRange`; `experience_*`/`user_*` rebuilt from `describe()`) |
| Dev entry works, but the **uploaded** version has no `window.PtApp` | SDK loader injection failed — the bundle entry isn't a normal HTML file with a `<head>` |
| Components render but look unstyled / wrong colors | one of the four UI wirings broken |
| Page fine, but dialogs/popovers unstyled | `pt-ui` class on `#root` instead of `<html>` |
| Upload rejected | root manifest / entry name / icon path / file types / `manifest.version` not bumped |
| Only this machine sees an old/broken version | a local dev entry was left on — exit it from the banner |

## Before you claim it works

1. `npm run build` — type-check + build.
2. `npm run package` — zip + structure self-check. **`build` alone is not
   enough**; confirm the packaging success line.
3. **Behavioral check on the real platform**: have the user set the app's local
   dev entry to your dev server (see references), open it inside Ptengine, and
   confirm `context` carries real values and at least one `data.query` returns
   non-empty rows. If this step cannot be run (no beta access, user unavailable),
   say so explicitly — "not yet verified against real data" — instead of
   declaring the app done.

## Manifest

- `manifest.json` `version` belongs to the app and **must increase on every
  upload** (`package.json` version is ignored by the platform).
- Legal `scopes` values: check the manifest JSON schema in `@ptengine/app-sdk`
  (unknown values fail upload). Today scopes are **validated only, not
  enforced** — `data.query` works regardless of them. Declare honestly what the
  app uses, but never write code that branches on a scope being "granted".
- `icon`: path inside the zip; adopted manually by an admin, never applied automatically (see references).

## Publishing

Create app / upload zip / draft preview / publish / permissions / dev entry /
pause / delete are all **human admin actions in the product UI** — guide the user
through [`references/publish-and-operate.md`](references/publish-and-operate.md);
never try to automate those screens with a browser.
