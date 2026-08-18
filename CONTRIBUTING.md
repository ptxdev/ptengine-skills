# Contributing

## This repository is public

Only **customer-facing** Ptengine skills belong here. Do not add internal
engineering or CSE skills, internal hostnames, internal ticket links, customer
names, credentials, or anything not already public on
https://helps.ptengine.com.

## Rules

- `skills/` is the only place you edit. `plugins/*/skills/` is generated —
  a PR that hand-edits it will fail CI.
- Run `npm run validate` before opening a PR.
- Keep `SKILL.md` under 200 lines; put depth in `references/`.
- A skill's `description` must say **when** to use it, so an agent can decide
  from the description alone whether to load it.
- Do not bump versions in a content PR. Releases are cut separately with
  `npm run release`.
