# Ptengine Agent Skills

> [English](README.md) | [中文](README.zh-CN.md)

[![validate](https://github.com/ptxdev/ptengine-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/ptxdev/ptengine-skills/actions/workflows/validate.yml)
[![latest tag](https://img.shields.io/github/v/tag/ptxdev/ptengine-skills)](https://github.com/ptxdev/ptengine-skills/tags)

Official [Agent Skills](https://agentskills.io/) from **Ptengine**. The Ptengine MCP
server gives your agent the *tools*; these skills give it the *expertise* — which tool to
reach for, how to author a query that answers the question asked, the anti-patterns to
avoid, and, for apps built on the platform, the hard boundaries that fail silently when
they are crossed.

## Skills

| Skill | What it does |
| --- | --- |
| `ptengine-mcp-analytics` | Query Ptengine analytics through the Ptengine MCP server — visits, events, funnels, user paths, experiments, landing pages, and individual users — and parse the results. |
| `ptengine-custom-app` | Build, debug, package, and publish a Ptengine Custom App: a static bundle that runs inside the platform and talks to it through `window.PtApp` (context, ui, nav, data.query, auth), optionally shipped with its own backend (a Worker serving `/api/*`, with a database, KV, server-side queries and platform-managed configuration). Covers the silent-failure pitfalls, the MCP↔App-SDK porting rules, multi-tenant invariants, the platform-assigned app address, and the platform-side publish flow. |

## Quick Start

### Claude Code

```
/plugin marketplace add ptxdev/ptengine-skills
/plugin install ptengine
```

### Any agent (Agent Skills CLI)

```
npx skills add ptxdev/ptengine-skills
```

### Manual

Copy any folder under `skills/` into your agent's skills directory, keeping the folder
name (it is the skill's id and must match `name:` in `SKILL.md`):

```bash
cp -R skills/ptengine-mcp-analytics ~/.claude/skills/
cp -R skills/ptengine-custom-app ~/.claude/skills/
```

## Prerequisites

- **`ptengine-mcp-analytics`** needs the **Ptengine MCP server** connected first.
  Setup (server URL, OAuth / API-key auth, per-client steps):
  👉 **https://helps.ptengine.com/en/ai/mcp**
- **`ptengine-custom-app`** needs Node 20+ and starts from the official starter
  ([ptxdev/ptengine-app-starter](https://github.com/ptxdev/ptengine-app-starter)).
  Connecting the MCP server is strongly recommended too — it is how you validate real
  event names and query params before writing `data.query` code.

## Repository layout

`skills/` is the source of truth. `plugins/ptengine/skills/` holds generated copies that
are committed because Claude Code and Cursor do not preserve symlinks on install — never
edit them by hand. `npm run validate` checks both.

## Contributing

Issues and pull requests are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first (this
repository is public, and only customer-facing skills belong in it). Maintainers: see
[AGENTS.md](AGENTS.md).

## License

MIT
