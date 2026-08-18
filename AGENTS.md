# Repository guide (maintainers)

## Layout

- `skills/<name>/` — **the source of truth.** `SKILL.md` (YAML frontmatter +
  behavioural guidance, ≤ 200 lines) plus optional `references/` for depth.
- `plugins/ptengine/skills/` — generated copies, committed. Claude Code and
  Cursor break symlinks on install, so these must be real files.
  **Never hand-edit them.**
- `.claude-plugin/marketplace.json` — the marketplace clients add.
- `scripts/` — sync + validators, plain Node ESM, zero runtime dependencies.

## Adding a new skill

1. `mkdir -p skills/<name>` and write `SKILL.md` with frontmatter:
   `name:` (must equal the directory name) and `description:` (≤ 1024 chars,
   says *when* to use the skill, not just what it is).
2. Move any long-form depth into `skills/<name>/references/<topic>.md` and link
   it from `SKILL.md`. Keep `SKILL.md` under 200 lines.
3. `npm run sync:plugins` — the new skill is picked up automatically; no script
   or manifest change is needed (all skills go into the single `ptengine` bundle).
4. `npm run validate`
5. Commit. The pre-commit hook re-runs both for you.

## Releasing

Version lives in three places and **must** be bumped together — a client only
receives an update when the version changes:

```bash
npm run release -- 1.1.0     # bumps all three, prints the next steps
npm run validate
git commit -am "chore(release): 发布 1.1.0"
git tag v1.1.0 && git push --follow-tags
```

## Guard rails

| Command | What it protects |
| --- | --- |
| `npm run validate:skill-structure` | frontmatter present, `name` == directory, description ≤ 1024, body ≤ 200 lines, no broken relative links |
| `npm run validate:claude-plugins` | manifests parse, names match directories, all three versions agree, semver format |
| `npm run validate:plugin-skills` | vendored copies match `skills/` exactly |
| `.husky/pre-commit` | re-syncs copies and runs `validate` before every local commit |
| `.github/workflows/validate.yml` | same checks in CI — catches `--no-verify` and edits made in the GitHub web UI |
