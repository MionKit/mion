#!/usr/bin/env node
// Lists exact tokens (code spans, link targets, flags, env vars) present at <base> but gone from the working tree,
// plus every rule line (never / always / must / only / ⚠️) of the old text, for the verifier to check by meaning.
// Usage: node .agents/skills/compact-agent-docs/lost-tokens.mjs <base> <path>...
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';

const git = (...args) =>
  execFileSync('git', args, {encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore']});
const [base, ...paths] = process.argv.slice(2);
if (!base || paths.length === 0) throw new Error('usage: lost-tokens.mjs <base> <path>...');

const oldFiles = git('ls-tree', '-r', '--name-only', base, '--', ...paths).split('\n').filter(Boolean);
// New text = every changed or untracked file anywhere (moves can leave the task dir) plus the task paths.
const changed = git('diff', '--name-only', base).split('\n');
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
const current = git('ls-files', '-co', '--exclude-standard', '--', ...paths).split('\n');
const newFiles = [...new Set([...changed, ...untracked, ...current])].filter((file) => file && existsSync(file));
const newText = newFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

const TOKEN = /`([^`\n]+)`|\]\(([^)\s]+)\)|(?<![\w-])(--[a-z][\w-]*)|\b([A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g;
const RULE = /\b(never|always|must|only|NEVER|ALWAYS|MUST|ONLY)\b|⚠️/;
const elsewhere = (token) => {
  try {
    return git('grep', '-lF', '-e', token, '--', '*.md').split('\n').filter(Boolean).slice(0, 2).join(', ');
  } catch {
    return '';
  }
};

const lost = new Map();
const rules = [];
for (const file of oldFiles) {
  git('show', `${base}:${file}`)
    .split('\n')
    .forEach((line, index) => {
      const at = `${file}:${index + 1}`;
      if (RULE.test(line)) rules.push(`${at}: ${line.trim()}`);
      for (const match of line.matchAll(TOKEN)) {
        const token = (match[1] ?? match[2] ?? match[3] ?? match[4]).split('#')[0].replace(/^(\.\.\/|\.\/)+/, '');
        if (token && !newText.includes(token) && !lost.has(token)) lost.set(token, at);
      }
    });
}

console.log(`## Tokens gone from the new text (${lost.size})`);
for (const [token, at] of lost) {
  const found = elsewhere(token);
  console.log(`- ${at}: \`${token}\`${found ? ` (still in ${found})` : ''}`);
}
console.log(`\n## Old rule lines to check by meaning (${rules.length})`);
for (const row of rules) console.log(`- ${row}`);
