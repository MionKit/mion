// Reads package dirs from pnpm-workspace.yaml, so a walk over every workspace package never misses a new folder.
import fs from 'node:fs';
import path from 'node:path';

// Only the `- '<dir>/*'` form is in use; any other glob throws instead of matching nothing.
export function workspacePatterns(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:[ \t]*(?:#.*)?$/.test(line));
  if (start < 0) throw new Error('pnpm-workspace.yaml has no packages: list');
  const patterns = [];
  // A top-level key ends the list; blank and comment lines do not.
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.startsWith('#')) break;
    const pattern = /^[ \t]+-[ \t]*['"]?([^'"#]+?)['"]?[ \t]*(?:#.*)?$/.exec(line)?.[1];
    if (!pattern) continue;
    if (!/^[\w.-]+(?:\/[\w.-]+)*\/\*$/.test(pattern)) throw new Error(`unsupported pnpm-workspace.yaml pattern "${pattern}": only "<dir>/*" is handled`);
    patterns.push(pattern.slice(0, -2));
  }
  return patterns;
}

// The manifests the release bump stamps; drizzle-orm line packages carry their own versions.
export function lockstepManifestFiles(repoRoot) {
  const parents = workspacePatterns(fs.readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'));
  const dirs = parents.flatMap((parent) => fs.readdirSync(path.join(repoRoot, parent)).map((name) => path.join(repoRoot, parent, name))).sort();
  return [repoRoot, ...dirs]
    .map((dir) => path.join(dir, 'package.json'))
    .filter((file) => {
      if (!fs.existsSync(file)) return false;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      return 'version' in pkg && pkg.versionLine !== 'drizzle-orm';
    });
}

export function lockstepDrift(repoRoot) {
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'version.json'), 'utf8')).version;
  return lockstepManifestFiles(repoRoot)
    .filter((file) => JSON.parse(fs.readFileSync(file, 'utf8')).version !== version)
    .map((file) => path.relative(repoRoot, file));
}
