// Unit-tests the manifest list that bump-version.mjs stamps and the check-tree.mjs drift sweep checks;
// a folder it misses drifts silently. Lives here because scripts/ has no vitest project.
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release script, no types
import {lockstepDrift, lockstepManifestFiles, workspaceParentDirs} from '../../../scripts/lib/workspace-dirs.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function write(root: string, relPath: string, body: string) {
  mkdirSync(dirname(join(root, relPath)), {recursive: true});
  writeFileSync(join(root, relPath), body);
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'rt-lockstep-'));
  dirs.push(root);
  write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - 'tools/*'\n");
  write(root, 'version.json', '{"version":"1.0.0"}');
  write(root, 'package.json', '{"version":"1.0.0"}');
  write(root, 'packages/a/package.json', '{"version":"1.0.0"}');
  write(root, 'packages/dialect/package.json', '{"version":"0.45.1","versionLine":"drizzle-orm"}');
  write(root, 'packages/no-version/package.json', '{"name":"x"}');
  write(root, 'packages/not-a-package/README.md', '');
  write(root, 'tools/card/package.json', '{"version":"0.9.0","private":true}');
  write(root, 'outside/b/package.json', '{"version":"0.1.0"}');
  return root;
}

describe('lockstep manifests', () => {
  it('reads every "<dir>/*" pattern of the packages list, comments and quotes aside', () => {
    const yaml = 'packages:\n  - \'packages/*\'\n  # private tools\n  - "tools/*" # own deps\n\nallowBuilds:\n  esbuild: true\n';
    expect(workspaceParentDirs(yaml)).toEqual(['packages', 'tools']);
  });

  it('keeps reading past a blank line and up to a last entry with no final newline', () => {
    expect(workspaceParentDirs("packages:\n  - 'packages/*'\n\n  - 'tools/*'\nnext: 1\n")).toEqual(['packages', 'tools']);
    expect(workspaceParentDirs("packages:\n  - 'packages/*'\n  - 'tools/*'")).toEqual(['packages', 'tools']);
  });

  it('reads CRLF line ends, a comment after the key, a column-0 comment and an unindented list', () => {
    expect(workspaceParentDirs("packages:\r\n  - 'packages/*'\r\n  - 'tools/*'\r\n")).toEqual(['packages', 'tools']);
    expect(workspaceParentDirs("packages: # dirs\n  - 'packages/*'\n")).toEqual(['packages']);
    expect(workspaceParentDirs("packages:\n  - 'a/*'\n# note\n  - 'b/*'\nnext: 1\n")).toEqual(['a', 'b']);
    expect(workspaceParentDirs('packages:\n- packages/*\n- tools/*\nnext: 1\n')).toEqual(['packages', 'tools']);
  });

  it('throws on a pattern it cannot expand instead of matching nothing', () => {
    expect(() => workspaceParentDirs("packages:\n  - 'packages/**'\n")).toThrow(/unsupported/);
    expect(() => workspaceParentDirs("packages:\n  - '!packages/x'\n")).toThrow(/unsupported/);
    expect(() => workspaceParentDirs('allowBuilds:\n  esbuild: true\n')).toThrow(/no packages/);
    expect(() => workspaceParentDirs('packages:\nallowBuilds:\n  esbuild: true\n')).toThrow(/lists no/);
  });

  it('lists the root and every workspace folder, minus the drizzle line and versionless manifests', () => {
    const root = makeRepo();
    const listed = lockstepManifestFiles(root).map((file: string) => relative(root, file));
    expect(listed).toEqual(['package.json', 'packages/a/package.json', 'tools/card/package.json']);
  });

  it('reports a private tool left behind on an older version', () => {
    expect(lockstepDrift(makeRepo())).toEqual(['tools/card/package.json']);
  });
});
