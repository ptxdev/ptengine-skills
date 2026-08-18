#!/usr/bin/env node
// 校验 skills/ 下每个 skill 是否符合 agentskills.io spec 的最低要求。
// 导出纯函数供测试；底部 CLI 在仓库根上跑，有错则 exit 1。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_DESCRIPTION = 1024;
const MAX_BODY_LINES = 200;

// 极简 frontmatter 解析：只认顶层 `key: value` 单行，够用且零依赖。
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const data = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim();
  }
  return { data, body };
}

function relativeLinks(markdown) {
  const links = [];
  const re = /\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links.push(target.split('#')[0]);
  }
  return links.filter(Boolean);
}

export function validateSkills(rootDir) {
  const errors = [];
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir)) return [`skills/ directory not found under ${rootDir}`];

  const names = readdirSync(skillsDir).filter((n) =>
    statSync(join(skillsDir, n)).isDirectory(),
  );
  for (const name of names.sort()) {
    const dir = join(skillsDir, name);
    const skillMd = join(dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      errors.push(`${name}: missing SKILL.md`);
      continue;
    }
    const text = readFileSync(skillMd, 'utf8');
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      errors.push(`${name}: missing YAML frontmatter in SKILL.md`);
      continue;
    }
    const { data, body } = parsed;
    if (!data.name) {
      errors.push(`${name}: missing \`name\` in frontmatter`);
    } else if (data.name !== name) {
      errors.push(`${name}: name '${data.name}' != directory '${name}'`);
    }
    if (!data.description) {
      errors.push(`${name}: missing \`description\` in frontmatter`);
    } else if (data.description.length > MAX_DESCRIPTION) {
      errors.push(
        `${name}: description is ${data.description.length} chars (max ${MAX_DESCRIPTION})`,
      );
    }
    const lines = body.split('\n').length;
    if (lines > MAX_BODY_LINES) {
      errors.push(`${name}: body is ${lines} lines (max ${MAX_BODY_LINES}) — move depth into references/`);
    }
    for (const link of relativeLinks(body)) {
      if (!existsSync(resolve(dir, link))) {
        errors.push(`${name}: broken link: ${link}`);
      }
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = validateSkills(root);
  if (errors.length) {
    console.error('skill structure validation failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('skill structure OK');
}
