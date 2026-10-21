#!/usr/bin/env node
// Checks that every relative markdown link outside code points at an existing file and heading.
// Usage: node .agents/skills/compact-agent-docs/check-links.mjs <file.md>...
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const LINK = /\]\(([^)\s]+)\)/g;
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
const anchors = (file) =>
  new Set(
    readFileSync(file, 'utf8')
      .replace(/```[\s\S]*?```/g, '')
      .split('\n')
      .filter((line) => /^#{1,6}\s/.test(line))
      .map((line) => slug(line.replace(/^#+\s*/, ''))),
  );

const broken = [];
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, '');
  text.split('\n').forEach((line, index) => {
    for (const [, target] of line.matchAll(LINK)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : resolve(file);
      const where = `${file}:${index + 1} → ${target}`;
      if (!existsSync(dest)) broken.push(`${where} (no such file)`);
      else if (anchor && statSync(dest).isFile() && dest.endsWith('.md') && !anchors(dest).has(anchor)) {
        broken.push(`${where} (no such heading)`);
      }
    }
  });
}

for (const row of broken) console.log(row);
console.log(broken.length ? `${broken.length} broken link(s)` : 'all links resolve');
process.exit(broken.length ? 1 : 0);
