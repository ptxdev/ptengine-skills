---
name: custom-app-review
description: Review a Ptengine Custom App that was NOT built inside App Builder — a source repo, a working copy, or a packaged zip — for the same four things the platform's built-in self-check looks at (security, AI cost, efficiency, design), and hand back a severity-ranked report the owner can act on before publishing. Use when someone asks to audit, review, check, or sanity-check a Custom App, asks "is this app safe / efficient / going to burn AI tokens", or wants the platform self-check run on code written elsewhere (Claude Code, Cursor, a human). Not for apps still inside App Builder — those get the self-check card in the product. 中文触发词：审查 / 自检 / 检查 Ptengine 应用、这个 app 合不合理、会不会把 token 用爆。日本語：Ptengine アプリのレビュー / セルフチェック。
---

# Reviewing a Custom App built outside App Builder

App Builder runs a two-layer self-check on every app it builds: **deterministic rules**
(`ptx audit`, 23 rules shipped in the app-starter) and a **model review** against a rubric,
then gates publishing on unfixed severe findings. An app built elsewhere gets none of that
automatically. This skill reproduces both layers by hand and produces the same kind of
report. It never edits the app — the owner decides what to fix.

## What you need

- **Source code** (`web/src`, `backend/src`, `shared`, `manifest.json`). A packaged zip holds
  only built assets: the rule layer can then check little beyond bundle size and manifest
  consistency, and the review layer has nothing to read. Ask for the repo; say so plainly if
  you only have a zip.
- **The starter's audit tooling** — the rules live in the app-starter, not in this skill:

```bash
TAG=$(git ls-remote --tags --refs https://github.com/ptxdev/ptengine-app-starter.git 'v3.*' | awk -F/ '{print $NF}' | sort -V | tail -1)
git clone --branch "$TAG" --depth 1 https://github.com/ptxdev/ptengine-app-starter.git /tmp/ptx-starter
cd /tmp/ptx-starter && npm install --no-audit --no-fund
```

Needs v3.10.0 or newer (the first tag with `scripts/ptx-audit.mjs`). Node 20+.

## Step 1 — rule layer

```bash
cd /tmp/ptx-starter
PTX_LANG=zh-CN node scripts/ptx-audit.mjs --root /path/to/the-app            # readable
node scripts/ptx-audit.mjs --root /path/to/the-app --json > /tmp/audit.json  # machine-readable
```

- Exit code **2** = at least one severe finding, **1** = only normal findings, **0** = clean,
  **3** = the check did not run (reason on stderr — usually a missing `web/src` / `backend/src`
  or a project that is not a v3 starter layout; `--src <dir>` points it at the right folders).
- `--json` prints one array of findings: `{ rule, dimension, severity, file, line, title, detail, fix }`
  with `title` / `detail` / `fix` each in `zh-CN`, `en-US`, `ja-JP`. Use the reader's language.
- The rules and their fixed severities are in `scripts/audit-rules.json`; the same text is in the
  starter's `AGENTS.md` under "自检规则（写代码前先看）" if the owner wants the "why".

Severe rules are the ones that cost money or leak data: hard-coded secrets, undeclared outbound
hosts, string-built SQL, `eval` / `postMessage('*')`, AI calls inside loops, scheduled jobs that
call AI without a constant cap, missing `max_tokens`. Treat them as **must fix before publish**.

## Step 2 — review layer (you are the model)

Read `/tmp/ptx-starter/scripts/audit-rubric.md` and apply it to `backend/src` and `web/src`.
It is written for a model reviewer: four dimensions (合理性 / 效率 / 安全 / AI 成本), what
counts, and explicitly what **not** to report (style, micro-optimisations, anything the rule
layer already flagged, dev-only code). Follow its "不要报" lists — a review padded with generic
advice is worse than a short one. Output shape per finding is the same as the rule layer's
(`dimension`, `severity`, `file`, `line?`, `title`, `detail`, `fix`); a review finding is
normally `normal`; call it `severe` only for `security` or `ai-cost` problems that would clearly
leak data or make cost unbounded, and say in `detail` why.

If a design doc or spec exists, read it first: "implementation differs from the plan" is a
合理性 finding only when you can quote the plan.

## Step 3 — the report

One table, severe first, then by dimension (security → ai-cost → efficiency → design):

| # | Severity | Dimension | Where | Finding | Fix |
|---|---|---|---|---|---|
| 1 | severe | ai-cost | `backend/src/index.ts:299` (AI-001) | `ctx.pt.ai.chat` called once per row inside the job loop | Batch the rows into one call, or cap with a constant (`rows.slice(0, MAX_ITEMS)`) |

Then three short lines: how many severe / normal, whether the app is **publishable as is**
(no = any severe left), and the one-line reproduce command (`node scripts/ptx-audit.mjs --root …`).
Mark rule-layer findings with their rule id; mark review findings "review" so the owner knows
which are deterministic. Do not fix code unless asked; when asked, fix severe first, re-run
Step 1, and show the new exit code.

## What this does not do

- It is not a publish gate. Only App Builder blocks publishing; a zip uploaded by hand or from
  CI is never checked. If the owner wants a gate, put `npm run audit` in their CI and fail on
  exit code 2 (see `ptengine-custom-app` → `references/publish-and-operate.md`).
- It does not replace `npm run doctor` (conventions and dependency floors) or `npm run package`
  (zip structure). Run those too when you are judging "ready to publish".
- For an app that lives in App Builder, point the owner at the in-product self-check instead
  ("不改代码，请对整个项目跑一次完整自检" in the chat).
