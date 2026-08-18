#!/usr/bin/env node
// 把 skills/ 下的全部 skill 复制成 plugins/<PLUGIN_ID>/skills/ 下的实体副本。
//
// 为什么要副本而不是 symlink：Claude Code 与 Cursor 安装 plugin 时 symlink 会逃出
// plugin 边界而失效，Windows checkout 也不保留 symlink。所以副本必须是实体文件，
// 且提交进仓。人永远不手改副本——改 skills/ 然后跑本脚本。
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_ID = 'ptengine';

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === '.DS_Store') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(relative(base, full));
  }
  return out;
}

function listSkills(rootDir) {
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((n) => statSync(join(skillsDir, n)).isDirectory())
    .sort();
}

// 返回值：变更/差异描述数组。check=true 时只比对不写盘。
export function syncPluginSkills(rootDir, { check = false } = {}) {
  const srcRoot = join(rootDir, 'skills');
  const destRoot = join(rootDir, 'plugins', PLUGIN_ID, 'skills');
  const messages = [];

  const wanted = new Map(); // 相对 destRoot 的路径 → 内容
  for (const skill of listSkills(rootDir)) {
    for (const rel of walk(join(srcRoot, skill))) {
      wanted.set(join(skill, rel), readFileSync(join(srcRoot, skill, rel)));
    }
  }

  // 多余文件（源已删）
  for (const rel of walk(destRoot)) {
    if (!wanted.has(rel)) {
      messages.push(`stale: ${rel}`);
      if (!check) rmSync(join(destRoot, rel));
    }
  }

  // 缺失或内容不一致
  for (const [rel, content] of wanted) {
    const dest = join(destRoot, rel);
    const same = existsSync(dest) && readFileSync(dest).equals(content);
    if (same) continue;
    messages.push(existsSync(dest) ? `out of date: ${rel}` : `missing: ${rel}`);
    if (!check) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
  }

  // 清掉空目录（skill 被整体删除后）
  if (!check && existsSync(destRoot)) {
    for (const entry of readdirSync(destRoot)) {
      const p = join(destRoot, entry);
      if (statSync(p).isDirectory() && walk(p).length === 0) rmSync(p, { recursive: true });
    }
  }

  return messages;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const messages = syncPluginSkills(root, { check });
  if (check && messages.length) {
    console.error('plugin skill copies are out of sync with skills/:');
    for (const m of messages) console.error(`  - ${m}`);
    console.error('\nfix: npm run sync:plugins  (never hand-edit plugins/*/skills/)');
    process.exit(1);
  }
  if (check) console.log('plugin skill copies in sync');
  else if (messages.length) {
    console.log(`synced ${messages.length} file(s) into plugins/${PLUGIN_ID}/skills/`);
    for (const m of messages) console.log(`  - ${m}`);
  } else console.log('already in sync');
}
