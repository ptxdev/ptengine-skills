# Ptengine Agent Skills

> [English](README.md) | [中文](README.zh-CN.md)

[![validate](https://github.com/ptxdev/ptengine-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/ptxdev/ptengine-skills/actions/workflows/validate.yml)
[![latest tag](https://img.shields.io/github/v/tag/ptxdev/ptengine-skills)](https://github.com/ptxdev/ptengine-skills/tags)

**Ptengine** 官方的 [Agent Skills](https://agentskills.io/)。Ptengine MCP 服务器给
AI 智能体的是*工具*，这些 skill 给的是*经验*：该用哪个工具、怎么把问题写成一次能答上来的
查询、哪些是常见的错误做法，以及——如果你在平台上做应用——哪些边界一旦越过就会悄无声息地出问题。

## Skills

| Skill | 做什么 |
| --- | --- |
| `ptengine-mcp-analytics` | 通过 Ptengine MCP 服务器查分析数据：访问、事件、漏斗、用户路径、实验、着陆页、单个用户，并正确读懂返回结果。 |
| `ptengine-custom-app` | 构建、调试、打包、发布 Ptengine 自定义应用：一个跑在平台内、通过 `window.PtApp`（context、ui、nav、data.query、auth）与宿主对话的静态包，可以再带一个自己的后端（服务 `/api/*` 的 Worker，含数据库、KV、服务端取数与平台托管的配置）。涵盖那些不会报错的坑、MCP 与 App SDK 之间的参数移植规则、多租户不变量，以及平台侧的发布流程。 |

## 快速开始

### Claude Code

```
/plugin marketplace add ptxdev/ptengine-skills
/plugin install ptengine
```

### 任意智能体（Agent Skills CLI）

```
npx skills add ptxdev/ptengine-skills
```

### 手动安装

把 `skills/` 下的任意目录整个复制到你的智能体的 skills 目录，目录名保持不变（它就是
skill 的 id，必须与 `SKILL.md` 里的 `name:` 一致）：

```bash
cp -R skills/ptengine-mcp-analytics ~/.claude/skills/
cp -R skills/ptengine-custom-app ~/.claude/skills/
```

## 前置条件

- **`ptengine-mcp-analytics`** 需要先接好 **Ptengine MCP 服务器**。
  配置方式（服务器地址、OAuth / API key 鉴权、各客户端的接入步骤）：
  👉 **https://helps.ptengine.com/en/ai/mcp**
- **`ptengine-custom-app`** 需要 Node 20+，并从官方脚手架
  （[ptxdev/ptengine-app-starter](https://github.com/ptxdev/ptengine-app-starter)）开始。
  也强烈建议同时接好 MCP 服务器——写 `data.query` 之前，就是靠它来核实真实的事件名与查询参数。

## 仓库结构

`skills/` 是唯一的真相来源。`plugins/ptengine/skills/` 是生成出来并提交进仓的副本——因为
Claude Code 与 Cursor 在安装时不保留符号链接，所以它必须是实体文件，**不要手改**。
`npm run validate` 会同时校验这两边。

## 参与贡献

欢迎提 issue 与 PR，动手前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)（本仓库是公开的，
只放面向客户的 skill）。维护者请看 [AGENTS.md](AGENTS.md)。

## License

MIT
