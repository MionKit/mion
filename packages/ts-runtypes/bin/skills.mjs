#!/usr/bin/env node
// Copies the ts-runtypes agent skills bundled in this package into your skills folder.
// Dependency-free; Node 18+ (relies on fs.cp). Ships as-is — never built.

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `ts-runtypes-skills — install the RunTypes agent skills into your project

Usage:
  npx ts-runtypes-skills --claude        copy skills into ./.claude/skills
  npx ts-runtypes-skills --agent         copy skills into ./.agent/skills
  npx ts-runtypes-skills --dir <path>    copy skills into <path> (resolved from cwd)
  npx ts-runtypes-skills -h | --help     show this help

Once installed, your AI agent picks the right skill up automatically for enrichment tasks.`;

function printUsage(stream = process.stdout) {
  stream.write(USAGE + '\n');
}

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--claude') return { target: resolve(process.cwd(), '.claude', 'skills') };
    if (arg === '--agent') return { target: resolve(process.cwd(), '.agent', 'skills') };
    if (arg === '--dir') {
      const dir = argv[i + 1];
      if (!dir) return { error: '--dir requires a path argument' };
      return { target: resolve(process.cwd(), dir) };
    }
    return { error: `unknown argument: ${arg}` };
  }
  return {};
}

async function listSkillDirs(skillsDir) {
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printUsage();
    return 0;
  }

  if (parsed.error) {
    process.stderr.write(`Error: ${parsed.error}\n\n`);
    printUsage(process.stderr);
    return 1;
  }

  if (!parsed.target) {
    printUsage();
    return 1;
  }

  const bundledSkills = fileURLToPath(new URL('../skills', import.meta.url));

  // Confirm the bundled skills directory exists and holds at least one skill.
  let bundledStat;
  try {
    bundledStat = await stat(bundledSkills);
  } catch {
    process.stderr.write(`Error: no bundled skills found at ${bundledSkills}\n`);
    return 1;
  }
  if (!bundledStat.isDirectory()) {
    process.stderr.write(`Error: bundled skills path is not a directory: ${bundledSkills}\n`);
    return 1;
  }

  const skillNames = await listSkillDirs(bundledSkills);
  if (!skillNames || skillNames.length === 0) {
    process.stderr.write(`Error: no skills found inside ${bundledSkills}\n`);
    return 1;
  }

  await mkdir(parsed.target, { recursive: true });

  for (const skillName of skillNames) {
    const from = resolve(bundledSkills, skillName);
    const to = resolve(parsed.target, skillName);
    await cp(from, to, { recursive: true });
    process.stdout.write(`installed ${skillName} -> ${to}\n`);
  }

  process.stdout.write(
    `Done. Copied ${skillNames.length} skill${skillNames.length === 1 ? '' : 's'} into ${parsed.target}\n`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`Error: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  });
