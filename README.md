# Ptengine Agent Skills

Official [Agent Skills](https://agentskills.io/) from **Ptengine** — they teach your
AI agent how to work with Ptengine: query analytics well (and read what comes
back), and build **Custom Apps** that run inside the Ptengine platform.

## Skills

| Skill | What it does |
| --- | --- |
| `ptengine-mcp-analytics` | Query Ptengine analytics through the Ptengine MCP server — visits, events, funnels, user paths, experiments, landing pages, and individual users — and parse the results. |
| `ptengine-custom-app` | Build, debug, package, and publish a Ptengine Custom App — a static bundle that runs inside the platform and talks to it through `window.PtApp` (context, ui, nav, data.query). Covers the silent-failure pitfalls, the MCP↔App-SDK porting rules, and the platform-side publish flow. |

## Prerequisites

- **`ptengine-mcp-analytics`** needs the **Ptengine MCP server** connected first.
  Setup (server URL, OAuth / API-key auth, per-client steps):
  👉 **https://helps.ptengine.com/en/ai/mcp**
- **`ptengine-custom-app`** needs Node 20+ and starts from the official starter
  ([ptxdev/ptengine-app-starter](https://github.com/ptxdev/ptengine-app-starter)).
  Connecting the MCP server is strongly recommended too — it is how you validate
  real event names and query params before writing `data.query` code.

The MCP server gives your agent the *tools*. These skills give it the *expertise*
— which tool to reach for, how to author a good query, the anti-patterns to
avoid, and (for apps) the hard boundaries that fail silently when violated.

## Install

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

Copy any folder under `skills/` into your agent's skills directory, keeping the
folder name (it is the skill's id and must match `name:` in `SKILL.md`):

```bash
cp -R skills/ptengine-mcp-analytics ~/.claude/skills/
cp -R skills/ptengine-custom-app ~/.claude/skills/
```

## Repository layout

`skills/` is the source of truth. `plugins/ptengine/skills/` holds generated
copies that are committed because Claude Code and Cursor do not preserve
symlinks on install — never edit them by hand.

Maintainers: see [AGENTS.md](AGENTS.md). Contributors: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
