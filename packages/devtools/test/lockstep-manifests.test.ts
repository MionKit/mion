// The release bump (scripts/release/bump-version.mjs) stamps every manifest
// lockstepManifestFiles lists. A workspace folder it misses drifts silently, as
// tools/code-card once did. Lives here because scripts/ has no vitest project.
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release script, no types
import * as workspaceDirs from '../../../scripts/lib/workspace-dirs.mjs';
// @ts-expect-error — plain .mjs release script, no types
import {REPO_ROOT} from '../../../scripts/lib/drizzle-line.mjs';

const {lockstepManifestFiles, workspacePatterns} = workspaceDirs;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function write(root: string, relPath: string, body: string) {
  mkdirSync(dirname(join(root, relPath)), {recursive: true});
  writeFileSync(join(root, relPath), body);
}

describe('lockstep manifests', () => {
  it('reads every "<dir>/*" pattern of the packages list, comments and quotes aside', () => {
    const yaml = 'packages:\n  - \'packages/*\'\n  # private tools\n  - "tools/*" # own deps\n\nallowBuilds:\n  esbuild: true\n';
    expect(workspacePatterns(yaml)).toEqual(['packages', 'tools']);
  });

  it('throws on a pattern it cannot expand instead of matching nothing', () => {
    expect(() => workspacePatterns("packages:\n  - 'packages/**'\n")).toThrow(/unsupported/);
    expect(() => workspacePatterns("packages:\n  - '!packages/x'\n")).toThrow(/unsupported/);
    expect(() => workspacePatterns('allowBuilds:\n  esbuild: true\n')).toThrow(/no packages/);
  });

  it('lists the root and every workspace folder, minus the drizzle line and versionless manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'rt-lockstep-'));
    dirs.push(root);
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - 'tools/*'\n");
    write(root, 'package.json', '{"version":"1.0.0"}');
    write(root, 'packages/a/package.json', '{"version":"1.0.0"}');
    write(root, 'packages/dialect/package.json', '{"version":"0.45.1","versionLine":"drizzle-orm"}');
    write(root, 'packages/no-version/package.json', '{"name":"x"}');
    write(root, 'packages/not-a-package/README.md', '');
    write(root, 'tools/card/package.json', '{"version":"0.9.0","private":true}');
    write(root, 'outside/b/package.json', '{"version":"1.0.0"}');
    const listed = lockstepManifestFiles(root).map((file: string) => relative(root, file));
    expect(listed).toEqual(['package.json', 'packages/a/package.json', 'tools/card/package.json']);
  });

  it('every lockstep manifest in this repo carries the version.json version', () => {
    const lockstep = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8')).version;
    const files: string[] = lockstepManifestFiles(REPO_ROOT);
    expect(files.map((file) => relative(REPO_ROOT, file))).toContain('tools/code-card/package.json');
    const drifted = files.filter((file) => JSON.parse(readFileSync(file, 'utf8')).version !== lockstep);
    expect(drifted.map((file) => relative(REPO_ROOT, file))).toEqual([]);
  });
});
