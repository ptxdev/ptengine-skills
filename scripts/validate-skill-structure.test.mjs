import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSkills } from './validate-skill-structure.mjs';

function makeRepo(skillName, skillMd, extraFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'skills-test-'));
  const dir = join(root, 'skills', skillName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), skillMd);
  for (const [rel, content] of Object.entries(extraFiles)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

const GOOD = `---
name: my-skill
description: A perfectly fine description.
---

# Body

See [refs](references/a.md).
`;

test('valid skill produces no errors', () => {
  const root = makeRepo('my-skill', GOOD, { 'references/a.md': '# A' });
  assert.deepEqual(validateSkills(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('name mismatching directory is an error', () => {
  const root = makeRepo('other-name', GOOD, { 'references/a.md': '# A' });
  const errors = validateSkills(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /name 'my-skill' != directory 'other-name'/);
  rmSync(root, { recursive: true, force: true });
});

test('missing frontmatter is an error', () => {
  const root = makeRepo('my-skill', '# No frontmatter here');
  assert.match(validateSkills(root).join('\n'), /missing YAML frontmatter/);
  rmSync(root, { recursive: true, force: true });
});

test('missing description is an error', () => {
  const root = makeRepo('my-skill', '---\nname: my-skill\n---\n\n# Body\n');
  assert.match(validateSkills(root).join('\n'), /missing `description`/);
  rmSync(root, { recursive: true, force: true });
});

test('description over 1024 chars is an error', () => {
  const long = 'x'.repeat(1025);
  const root = makeRepo('my-skill', `---\nname: my-skill\ndescription: ${long}\n---\n\n# Body\n`);
  assert.match(validateSkills(root).join('\n'), /description is 1025 chars/);
  rmSync(root, { recursive: true, force: true });
});

test('body over 200 lines is an error', () => {
  const body = Array.from({ length: 201 }, (_, i) => `line ${i}`).join('\n');
  const root = makeRepo('my-skill', `---\nname: my-skill\ndescription: ok\n---\n${body}\n`);
  assert.match(validateSkills(root).join('\n'), /body is 20[12] lines/);
  rmSync(root, { recursive: true, force: true });
});

test('broken relative link is an error', () => {
  const root = makeRepo('my-skill', GOOD);
  assert.match(validateSkills(root).join('\n'), /broken link: references\/a\.md/);
  rmSync(root, { recursive: true, force: true });
});

test('missing SKILL.md is an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-test-'));
  mkdirSync(join(root, 'skills', 'empty-skill'), { recursive: true });
  assert.match(validateSkills(root).join('\n'), /missing SKILL\.md/);
  rmSync(root, { recursive: true, force: true });
});
