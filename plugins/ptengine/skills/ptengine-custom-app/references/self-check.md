# Self-check (`npm run audit`) — what it is, what it is not

Starter **v3.10.0+** ships `npm run audit` (`scripts/ptx-audit.mjs`): 23 deterministic rules
over `web/src`, `backend/src` and `shared`, the **same rules App Builder runs** on every app it
builds, in four areas:

| Area | Severe (must fix) | Normal (owner decides) |
|---|---|---|
| Security | hard-coded secrets, undeclared outbound hosts, string-built SQL, `eval` / `postMessage('*')` | — |
| AI cost | AI call inside a loop (AI-001), scheduled job calling AI without a constant cap (AI-002), missing `max_tokens` | prompt built from raw page URLs etc. |
| Efficiency | — | per-item queries in loops, missing `timeRange`, a JS chunk over 800 KB (EFF-004) |
| Design | — | scopes out of sync with the code, half-built front end / back end, async components without loading or error states |

## Running it

```bash
npm run audit                          # terminal output, language from PTX_LANG (zh-CN / en-US / ja-JP, default en-US)
npm run -s audit -- --json             # one JSON document, every message in all three languages
npm run audit -- --src web/src         # limit the scan (repeatable)
```

Exit code **2** = at least one severe finding → fix before packaging. **1** = only normal
findings → list them to the user and let them decide. **0** = clean. **3** = the check itself
did not run (reason on stderr). The rules, with the "why" and the fix, are listed in the
project's `AGENTS.md` under "自检规则（写代码前先看）" — write to them from the start.

## Review layer, locally

App Builder adds a second layer: a model reads the code against `scripts/audit-rubric.md`
(design / efficiency / security / AI cost, with explicit "do not report" lists). Locally
nothing runs it for you — when a change touches AI calls, queries or trust boundaries, read the
rubric and review the code against it yourself, and report in the same shape.

## No gate outside App Builder

Only App Builder blocks a publish on unfixed severe findings. A zip uploaded by hand or by
`ptx deploy` from CI is **not** checked. Put `npm run audit` in CI before `ptx deploy` and fail
the job on exit code 2 (strict teams: 1 too) — see `publish-and-operate.md`.

## Older projects

A project scaffolded before v3.10.0 has no `npm run audit`. Copy `scripts/audit/`,
`scripts/audit-rules.json`, `scripts/audit-rubric.md` and the `audit` / `audit:doc` scripts from
the current starter, then regenerate the AGENTS.md section with `npm run audit:doc`.

For an app that was **not** built from the starter at all, use the `custom-app-review` skill:
it runs the same rules from a starter checkout (`node scripts/ptx-audit.mjs --root <app>`).
