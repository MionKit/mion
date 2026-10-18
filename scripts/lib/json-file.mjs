// Rewrites a JSON file in the indent it already uses, so a version bump stays a one-line diff.
import fs from 'node:fs';

export function detectIndent(text) {
  return /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
}

export function writeJsonKeepingIndent(file, value) {
  const indent = fs.existsSync(file) ? detectIndent(fs.readFileSync(file, 'utf8')) : '  ';
  fs.writeFileSync(file, JSON.stringify(value, null, indent) + '\n');
}
