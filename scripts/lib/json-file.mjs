// Rewrites a JSON file in the indent it already uses, so a version bump stays a one-line diff.
import fs from 'node:fs';

export function detectIndent(text) {
  return /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
}

export function writeJsonKeepingIndent(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, detectIndent(fs.readFileSync(file, 'utf8'))) + '\n');
}
