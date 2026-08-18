import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateClaudePlugins } from './validate-claude-plugins.mjs';

function makeRepo({ marketplace, plugins }) {
  const root = mkdtempSync(join(tmpdir(), 'claude-test-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplace, null, 2));
  for (const [name, manifest] of Object.entries(plugins)) {
    const dir = join(root, 'plugins', name, '.claude-plugin');
    mkdirSync(dir, { recursive: true });
    if (manifest) writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  }
  return root;
}

const MARKET = {
  name: 'ptengine',
  owner: { name: 'Ptengine' },
  metadata: { description: 'd', version: '1.0.0' },
  plugins: [{ name: 'ptengine', source: './plugins/ptengine', description: 'd', version: '1.0.0' }],
};
const PLUGIN = { name: 'ptengine', description: 'd', version: '1.0.0' };

test('consistent manifests produce no errors', () => {
  const root = makeRepo({ marketplace: MARKET, plugins: { ptengine: PLUGIN } });
  assert.deepEqual(validateClaudePlugins(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('version mismatch between marketplace entry and plugin.json is an error', () => {
  const root = makeRepo({
    marketplace: MARKET,
    plugins: { ptengine: { ...PLUGIN, version: '1.0.1' } },
  });
  assert.match(validateClaudePlugins(root).join('\n'), /version mismatch/);
  rmSync(root, { recursive: true, force: true });
});

test('metadata.version differing from plugin entry version is an error', () => {
  const root = makeRepo({
    marketplace: { ...MARKET, metadata: { description: 'd', version: '9.9.9' } },
    plugins: { ptengine: PLUGIN },
  });
  assert.match(validateClaudePlugins(root).join('\n'), /metadata\.version/);
  rmSync(root, { recursive: true, force: true });
});

test('source pointing at a missing plugin.json is an error', () => {
  const root = makeRepo({ marketplace: MARKET, plugins: { ptengine: null } });
  assert.match(validateClaudePlugins(root).join('\n'), /missing plugin\.json/);
  rmSync(root, { recursive: true, force: true });
});

test('plugin name differing from its directory is an error', () => {
  const root = makeRepo({
    marketplace: MARKET,
    plugins: { ptengine: { ...PLUGIN, name: 'wrong' } },
  });
  assert.match(validateClaudePlugins(root).join('\n'), /name 'wrong' != directory 'ptengine'/);
  rmSync(root, { recursive: true, force: true });
});

test('non-semver version is an error', () => {
  const root = makeRepo({
    marketplace: {
      ...MARKET,
      metadata: { description: 'd', version: 'v1.0' },
      plugins: [{ ...MARKET.plugins[0], version: 'v1.0' }],
    },
    plugins: { ptengine: { ...PLUGIN, version: 'v1.0' } },
  });
  assert.match(validateClaudePlugins(root).join('\n'), /not semver/);
  rmSync(root, { recursive: true, force: true });
});
