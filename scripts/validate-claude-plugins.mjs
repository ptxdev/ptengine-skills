#!/usr/bin/env node
// 校验 Claude Code 的两层清单：根 .claude-plugin/marketplace.json 与
// 每个 plugins/<id>/.claude-plugin/plugin.json，重点是版本三处一致
// （metadata.version / plugins[].version / plugin.json version）——
// 版本对不上客户端就收不到更新。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;

export function validateClaudePlugins(rootDir) {
  const errors = [];
  const marketPath = join(rootDir, '.claude-plugin', 'marketplace.json');
  if (!existsSync(marketPath)) return ['missing .claude-plugin/marketplace.json'];

  let market;
  try {
    market = JSON.parse(readFileSync(marketPath, 'utf8'));
  } catch (e) {
    return [`.claude-plugin/marketplace.json is not valid JSON: ${e.message}`];
  }

  if (!market.name) errors.push('marketplace.json: missing `name`');
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) {
    errors.push('marketplace.json: `plugins` must be a non-empty array');
    return errors;
  }

  const metaVersion = market.metadata?.version;
  if (!metaVersion) errors.push('marketplace.json: missing `metadata.version`');
  else if (!SEMVER.test(metaVersion)) errors.push(`marketplace.json: metadata.version '${metaVersion}' is not semver (x.y.z)`);

  for (const entry of market.plugins) {
    const label = `marketplace.json plugins[${entry.name ?? '?'}]`;
    if (!entry.name) { errors.push(`${label}: missing \`name\``); continue; }
    if (!entry.description) errors.push(`${label}: missing \`description\``);
    if (!entry.version) errors.push(`${label}: missing \`version\``);
    else if (!SEMVER.test(entry.version)) errors.push(`${label}: version '${entry.version}' is not semver (x.y.z)`);
    if (metaVersion && entry.version && metaVersion !== entry.version) {
      errors.push(`${label}: metadata.version '${metaVersion}' != plugin entry version '${entry.version}'`);
    }
    if (!entry.source) { errors.push(`${label}: missing \`source\``); continue; }

    const pluginDir = resolve(rootDir, entry.source);
    const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) {
      errors.push(`${label}: source '${entry.source}' has missing plugin.json`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      errors.push(`${entry.name}: plugin.json is not valid JSON: ${e.message}`);
      continue;
    }
    const dirName = basename(pluginDir);
    if (manifest.name !== dirName) {
      errors.push(`${entry.name}: plugin.json name '${manifest.name}' != directory '${dirName}'`);
    }
    if (manifest.name !== entry.name) {
      errors.push(`${entry.name}: plugin.json name '${manifest.name}' != marketplace entry name '${entry.name}'`);
    }
    if (!manifest.description) errors.push(`${entry.name}: plugin.json missing \`description\``);
    if (!manifest.version) errors.push(`${entry.name}: plugin.json missing \`version\``);
    else if (!SEMVER.test(manifest.version)) errors.push(`${entry.name}: plugin.json version '${manifest.version}' is not semver (x.y.z)`);
    else if (entry.version && manifest.version !== entry.version) {
      errors.push(`${entry.name}: version mismatch — marketplace '${entry.version}' vs plugin.json '${manifest.version}'`);
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = validateClaudePlugins(root);
  if (errors.length) {
    console.error('Claude plugin manifest validation failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Claude plugin manifests OK');
}
