import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncPluginSkills, PLUGIN_ID } from './sync-plugin-skills.mjs';

function makeRepo(skills) {
  const root = mkdtempSync(join(tmpdir(), 'sync-test-'));
  for (const [name, files] of Object.entries(skills)) {
    for (const [rel, content] of Object.entries(files)) {
      const p = join(root, 'skills', name, rel);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, content);
    }
  }
  return root;
}

const vendored = (root, ...parts) => join(root, 'plugins', PLUGIN_ID, 'skills', ...parts);

test('sync copies every skill into the plugin bundle', () => {
  const root = makeRepo({ 'a-skill': { 'SKILL.md': 'A', 'references/x.md': 'X' } });
  syncPluginSkills(root, { check: false });
  assert.equal(readFileSync(vendored(root, 'a-skill', 'SKILL.md'), 'utf8'), 'A');
  assert.equal(readFileSync(vendored(root, 'a-skill', 'references', 'x.md'), 'utf8'), 'X');
  rmSync(root, { recursive: true, force: true });
});

test('sync is idempotent and reports no changes on a second run', () => {
  const root = makeRepo({ 'a-skill': { 'SKILL.md': 'A' } });
  syncPluginSkills(root, { check: false });
  assert.deepEqual(syncPluginSkills(root, { check: false }), []);
  rmSync(root, { recursive: true, force: true });
});

test('check reports drift when a vendored copy was hand-edited', () => {
  const root = makeRepo({ 'a-skill': { 'SKILL.md': 'A' } });
  syncPluginSkills(root, { check: false });
  writeFileSync(vendored(root, 'a-skill', 'SKILL.md'), 'HAND EDITED');
  const diffs = syncPluginSkills(root, { check: true });
  assert.equal(diffs.length, 1);
  assert.match(diffs[0], /out of date: a-skill\/SKILL\.md/);
  assert.equal(readFileSync(vendored(root, 'a-skill', 'SKILL.md'), 'utf8'), 'HAND EDITED');
  rmSync(root, { recursive: true, force: true });
});

test('sync deletes vendored files whose source is gone', () => {
  const root = makeRepo({ 'a-skill': { 'SKILL.md': 'A' } });
  syncPluginSkills(root, { check: false });
  rmSync(join(root, 'skills', 'a-skill'), { recursive: true, force: true });
  syncPluginSkills(root, { check: false });
  assert.equal(existsSync(vendored(root, 'a-skill')), false);
  rmSync(root, { recursive: true, force: true });
});

test('sync never creates symlinks', () => {
  const root = makeRepo({ 'a-skill': { 'SKILL.md': 'A' } });
  syncPluginSkills(root, { check: false });
  assert.equal(lstatSync(vendored(root, 'a-skill', 'SKILL.md')).isSymbolicLink(), false);
  rmSync(root, { recursive: true, force: true });
});
