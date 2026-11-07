// The workspace package dirs pnpm-workspace.yaml declares, so a script walking "every
// workspace package" can never miss a folder the workspace added.
import fs from 'node:fs';
import path from 'node:path';

// Only the `- '<dir>/*'` form is in use; any other glob throws instead of matching nothing.
export function workspacePatterns(yamlText) {
  const block = /^packages:\n((?:[ \t]+(?:-.*|#.*)?\n)*)/m.exec(yamlText)?.[1];
  if (!block) throw new Error('pnpm-workspace.yaml has no packages: list');
  return block
    .split('\n')
    .map((line) => /^[ \t]+-[ \t]*['"]?([^'"#]+?)['"]?[ \t]*(?:#.*)?$/.exec(line)?.[1])
    .filter(Boolean)
    .map((pattern) => {
      if (!/^[\w.-]+(?:\/[\w.-]+)*\/\*$/.test(pattern)) throw new Error(`unsupported pnpm-workspace.yaml pattern "${pattern}": only "<dir>/*" is handled`);
      return pattern.slice(0, -2);
    });
}

// Absolute dirs holding a package.json, sorted.
export function workspacePackageDirs(repoRoot) {
  const patterns = workspacePatterns(fs.readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'));
  return patterns
    .flatMap((parent) => fs.readdirSync(path.join(repoRoot, parent)).map((name) => path.join(repoRoot, parent, name)))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
    .sort();
}

// The manifests the release bump stamps with the version.json string: the root + every
// workspace package with a version, minus the drizzle-orm version line (own versions).
export function lockstepManifestFiles(repoRoot) {
  return [repoRoot, ...workspacePackageDirs(repoRoot)]
    .map((dir) => path.join(dir, 'package.json'))
    .filter((file) => {
      if (!fs.existsSync(file)) return false;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      return 'version' in pkg && pkg.versionLine !== 'drizzle-orm';
    });
}
