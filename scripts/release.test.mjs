import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpVersion } from './release.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'release-test-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        name: 'ptengine',
        metadata: { description: 'd', version: '1.0.0' },
        plugins: [{ name: 'ptengine', source: './plugins/ptengine', description: 'd', version: '1.0.0' }],
      },
      null,
      2,
    ) + '\n',
  );
  mkdirSync(join(root, 'plugins', 'ptengine', '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, 'plugins', 'ptengine', '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'ptengine', description: 'd', version: '1.0.0' }, null, 2) + '\n',
  );
  return root;
}

const read = (root, ...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8'));

test('bump updates all three version locations', () => {
  const root = makeRepo();
  const changed = bumpVersion(root, '1.1.0');
  const market = read(root, '.claude-plugin', 'marketplace.json');
  assert.equal(market.metadata.version, '1.1.0');
  assert.equal(market.plugins[0].version, '1.1.0');
  assert.equal(read(root, 'plugins', 'ptengine', '.claude-plugin', 'plugin.json').version, '1.1.0');
  assert.equal(changed.length, 2);
  rmSync(root, { recursive: true, force: true });
});

test('bump rejects a non-semver version', () => {
  const root = makeRepo();
  assert.throws(() => bumpVersion(root, 'v1.1.0'), /not semver/);
  rmSync(root, { recursive: true, force: true });
});

test('bump rejects a version that is not greater than the current one', () => {
  const root = makeRepo();
  assert.throws(() => bumpVersion(root, '1.0.0'), /must be greater than current 1\.0\.0/);
  assert.throws(() => bumpVersion(root, '0.9.0'), /must be greater than current 1\.0\.0/);
  rmSync(root, { recursive: true, force: true });
});

test('bump keeps trailing newline and 2-space indent', () => {
  const root = makeRepo();
  bumpVersion(root, '2.0.0');
  const raw = readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.match(raw, /\n {2}"name"/);
  rmSync(root, { recursive: true, force: true });
});
