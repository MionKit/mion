// The release bump (scripts/release/bump-version.mjs) stamps every manifest
// lockstepManifestFiles lists. A workspace folder it misses drifts silently, as
// tools/code-card once did. The repo-wide drift sweep runs from check-tree.mjs;
// this unit-tests its rules. Lives here because scripts/ has no vitest project.
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release script, no types
import * as workspaceDirs from '../../../scripts/lib/workspace-dirs.mjs';

const {lockstepDrift, lockstepManifestFiles, workspacePatterns} = workspaceDirs;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function write(root: string, relPath: string, body: string) {
  mkdirSync(dirname(join(root, relPath)), {recursive: true});
  writeFileSync(join(root, relPath), body);
}

// Root + packages/a on 1.0.0, a drizzle-line package on its own version, a
// private tool still on 0.9.0, and a manifest outside the workspace.
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
    expect(workspacePatterns(yaml)).toEqual(['packages', 'tools']);
  });

  it('keeps reading past a blank line and up to a last entry with no final newline', () => {
    expect(workspacePatterns("packages:\n  - 'packages/*'\n\n  - 'tools/*'\nnext: 1\n")).toEqual(['packages', 'tools']);
    expect(workspacePatterns("packages:\n  - 'packages/*'\n  - 'tools/*'")).toEqual(['packages', 'tools']);
  });

  it('throws on a pattern it cannot expand instead of matching nothing', () => {
    expect(() => workspacePatterns("packages:\n  - 'packages/**'\n")).toThrow(/unsupported/);
    expect(() => workspacePatterns("packages:\n  - '!packages/x'\n")).toThrow(/unsupported/);
    expect(() => workspacePatterns('allowBuilds:\n  esbuild: true\n')).toThrow(/no packages/);
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
