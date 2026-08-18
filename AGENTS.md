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
5. Stage everything under `skills/` before committing — the pre-commit hook
   refuses a commit while `skills/` still has unstaged or untracked changes,
   because it generates the copies from the working tree while the commit
   records the index, and the two would silently disagree.
6. `main` is protected: push a branch and open a PR. The hook re-runs sync and
   validate for you locally; CI re-runs them on the PR.

## Releasing

Version lives in three places and **must** be bumped together — a client only
receives an update when the version changes:

`main` is protected, so a release goes through a PR. Tags are not covered by
branch rules, so the tag is pushed directly once the release commit is on `main`:

```bash
npm run release -- 1.1.0            # bumps all three; refuses a non-semver or non-increasing version
npm run validate
git checkout -b release/1.1.0
git commit -am "chore(release): 发布 1.1.0"
git push -u origin release/1.1.0    # open the PR, wait for validate to go green, merge
git checkout main && git pull
git tag -a v1.1.0 -m "ptengine-skills 1.1.0"
git push --follow-tags
```

Version format is bare semver — `1.1.0`, no `v` prefix. The `v` appears only in
the git tag name. `npm run release` is the only supported way to bump: it moves
all three locations in one shot and refuses to write anything at all if any
plugin manifest is missing, so a half-bumped release cannot happen.

## Guard rails

| Command | What it protects |
| --- | --- |
| `npm run validate:skill-structure` | frontmatter present, `name` == directory, description ≤ 1024, body ≤ 200 lines, no broken relative links |
| `npm run validate:claude-plugins` | manifests parse, names match directories, all three versions agree, semver format |
| `npm run validate:plugin-skills` | vendored copies match `skills/` exactly |
| `.husky/pre-commit` | refuses a commit with unstaged/untracked `skills/` changes, then re-syncs copies and runs `validate` |
| `.github/workflows/validate.yml` | same checks in CI, plus a scan for internal hostnames and secret shapes — catches `--no-verify` and edits made in the GitHub web UI |
| branch ruleset on `main` | requires a PR with the `validate` check green; blocks direct pushes, force pushes and deletion. CI is only a signal — this is what makes it a gate. Since Claude Code serves the **default branch**, not a tag, a bad direct push would reach customers immediately. |
