# Ptengine Agent Skills

Official [Agent Skills](https://agentskills.io/) from **Ptengine** — they teach your
AI agent how to query Ptengine analytics well and how to read what comes back.

## Prerequisite

These skills help your agent use the **Ptengine MCP server**; connect it first.
Setup (server URL, OAuth / API-key auth, per-client steps):
👉 **https://helps.ptengine.com/en/ai/mcp**

The MCP server gives your agent the *tools*. These skills give it the *expertise*
to use them — which tool to reach for, how to author a good query, how to resolve
names and ids first, the one big anti-pattern to avoid, and how to parse the
result envelope.

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
```

## Skills

| Skill | What it does |
| --- | --- |
| `ptengine-mcp-analytics` | Query Ptengine analytics through the Ptengine MCP server — visits, events, funnels, user paths, experiments, landing pages, and individual users — and parse the results. |

## Repository layout

`skills/` is the source of truth. `plugins/ptengine/skills/` holds generated
copies that are committed because Claude Code and Cursor do not preserve
symlinks on install — never edit them by hand.

Maintainers: see [AGENTS.md](AGENTS.md). Contributors: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
