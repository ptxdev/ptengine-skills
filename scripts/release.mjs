#!/usr/bin/env node
// 一次性 bump 全部版本位置。版本散在三处（marketplace metadata.version、
// marketplace plugins[].version、每个 plugin.json 的 version）——
// 只改一处客户端收不到更新，所以发版必须走这个脚本。
//
// 用法：npm run release -- 1.1.0
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');

export function bumpVersion(rootDir, version) {
  if (!SEMVER.test(version)) {
    throw new Error(`version '${version}' is not semver (x.y.z, no leading v)`);
  }
  const marketPath = join(rootDir, '.claude-plugin', 'marketplace.json');
  if (!existsSync(marketPath)) throw new Error('missing .claude-plugin/marketplace.json');
  const market = readJson(marketPath);

  const current = market.metadata?.version;
  if (current && cmp(version, current) <= 0) {
    throw new Error(`version '${version}' must be greater than current ${current}`);
  }

  const changed = [];
  market.metadata = { ...market.metadata, version };
  for (const entry of market.plugins ?? []) entry.version = version;
  writeJson(marketPath, market);
  changed.push('.claude-plugin/marketplace.json');

  for (const entry of market.plugins ?? []) {
    if (!entry.source) continue;
    const manifestPath = join(resolve(rootDir, entry.source), '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    manifest.version = version;
    writeJson(manifestPath, manifest);
    changed.push(`${entry.source}/.claude-plugin/plugin.json`);
  }
  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: npm run release -- <version>   e.g. npm run release -- 1.1.0');
    process.exit(1);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let changed;
  try {
    changed = bumpVersion(root, version);
  } catch (e) {
    console.error(`release failed: ${e.message}`);
    process.exit(1);
  }
  console.log(`bumped to ${version}:`);
  for (const f of changed) console.log(`  - ${f}`);
  console.log(`\nnext:\n  npm run validate\n  git commit -am "chore(release): 发布 ${version}"\n  git tag v${version} && git push --follow-tags`);
}
