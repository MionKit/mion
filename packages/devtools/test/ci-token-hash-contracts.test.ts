// A comment-only commit skips the `tokens` lanes, while the `raw` lanes that read comments still run.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs repo script, no types.
import {LANES, TOKEN_HASHED, codeDigests, decide, laneHashes, refAndBaseHashes} from '../../../scripts/ci/lanes.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
type Lane = {hash: 'tokens' | 'raw'; items?: Record<string, unknown>};
const lanes = Object.entries(LANES) as [string, Lane][];
const laneNames = (mode: Lane['hash']): string[] =>
  lanes.flatMap(([name, lane]) =>
    lane.hash === mode ? [name, ...Object.keys(lane.items ?? {}).map((item) => `${name}.${item}`)] : []
  );

describe('the hash mode of each lane', () => {
  it('declares tokens or raw on every lane', () => {
    for (const [name, lane] of lanes) expect(['tokens', 'raw'], name).toContain(lane.hash);
  });

  it('keeps every lane that reads comments raw', () => {
    expect(laneNames('raw').sort()).toEqual(['go-static', 'go-tools', 'js-static']);
  });

  it('hashes code by its code, and the files whose exact text a test or the site reads raw', () => {
    for (const file of [
      'packages/core/src/index.ts',
      'scripts/ci/lanes.mjs',
      'ts-go-runtypes/internal/reflection/kind.go',
      'packages/devtools/lib/index.cjs',
    ]) {
      expect(TOKEN_HASHED(file), file).toBe(true);
    }
    for (const file of [
      'ts-go-runtypes/internal/testfixtures/temporal.d.ts',
      'packages/devtools/test-fixtures/a.ts',
      'ts-go-runtypes/internal/convert/testdata/a.ts',
      'packages/devtools/test/__snapshots__/a.ts',
      'packages/private-examples/src/a.ts',
      'packages/private-drizzle-example-app/src/server/users.routes.ts',
      'container/pre-publish-e2e/build-all.mjs',
      'ts-go-runtypes/internal/cachegen/purefnids/ids.generated.go',
      'packages/run-types/src/go-generated/fnHashes.generated.ts',
      'container/pre-publish-e2e/apps/mion-next/app/page.tsx',
      'container/benchmarks/_deps/competitors/zod/a.ts',
      'ts-go-runtypes/third_party/tsgolint/a.go',
      'packages/core/package.json',
    ]) {
      expect(TOKEN_HASHED(file), file).toBe(false);
    }
  });
});

describe('laneHashes', () => {
  const entries = [
    {objectname: 'a'.repeat(40), path: 'packages/core/src/index.ts'},
    {objectname: 'b'.repeat(40), path: 'ts-go-runtypes/internal/reflection/kind.go'},
  ];
  const withDigests = (byKey: Map<string, string>, mode: 't' | 'r' = 't') =>
    laneHashes(undefined, {entries, digests: {mode, byKey}}).hashes;

  it('puts the digest in the tokens lanes only, under a t prefix', () => {
    const plain = withDigests(new Map());
    const digested = withDigests(new Map([[`${entries[0].objectname} ts`, 'c'.repeat(64)]]));
    expect(digested.js).not.toBe(plain.js);
    expect(digested.js.startsWith('t')).toBe(true);
    expect(digested['js-static']).toBe(plain['js-static']);
    expect(digested['js-static']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('gives a raw fallback its own prefix, so it never matches a token marker', () => {
    const raw = withDigests(new Map(), 'r');
    const tokens = withDigests(new Map());
    for (const name of laneNames('tokens')) {
      expect(raw[name].startsWith('r'), name).toBe(true);
      expect(raw[name].slice(1)).toBe(tokens[name].slice(1));
    }
    for (const name of laneNames('raw')) expect(raw[name]).toBe(tokens[name]);
  });
});

describe('codeDigests falls back to raw', () => {
  it('when the tool is missing', () => {
    expect(codeDigests([], {bin: path.join(os.tmpdir(), 'no-such-code-digest')}).mode).toBe('r');
  });

  it('when the tool fails', () => {
    expect(codeDigests([], {bin: '/bin/false'}).mode).toBe('r');
  });
});

describe('a comment-only commit', () => {
  it('keeps every tokens hash, moves the raw lanes, and a code commit moves both', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'lanes-tokens-'));
    const git = (...args: string[]) =>
      spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', ...args], {cwd: repo, encoding: 'utf8'});
    const commit = (files: Record<string, string>) => {
      for (const [file, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
        writeFileSync(path.join(repo, file), text);
      }
      git('add', '.');
      git('commit', '-qm', 'x');
    };
    try {
      git('init', '-q');
      commit({'packages/x/src/a.ts': 'export const a = 1;\n', 'ts-go-runtypes/internal/x/a.go': 'package x\n\nvar A = 1\n'});
      commit({
        'packages/x/src/a.ts': '// why\n\nexport const a = 1; // one\n',
        'ts-go-runtypes/internal/x/a.go': '// Package x.\npackage x\n\n\nvar A = 1 // one\n',
      });
      commit({'packages/x/src/a.ts': 'export const a = 2;\n', 'ts-go-runtypes/internal/x/a.go': 'package x\n\nvar A = 2\n'});
      const [base, comments, code] = ['HEAD~2', 'HEAD~1', 'HEAD'].map((ref) => laneHashes(ref, {cwd: repo}));
      expect(base.mode, 'mion-bin/code-digest is missing: run pnpm run check:builds').toBe('t');
      for (const name of laneNames('tokens')) expect(comments.hashes[name], name).toBe(base.hashes[name]);
      for (const name of laneNames('raw')) expect(comments.hashes[name], name).not.toBe(base.hashes[name]);
      for (const name of ['js', 'go', 'js-static', 'go-static']) expect(code.hashes[name], name).not.toBe(comments.hashes[name]);
      // Against the PR base the tokens lanes skip and the raw lanes run.
      const {hashes, baseHashes, mode} = refAndBaseHashes('HEAD~1', 'HEAD~2', {cwd: repo});
      expect(mode).toBe('t');
      const verdict = decide(Object.keys(LANES), {hashes, baseHashes});
      for (const [name, lane] of lanes) expect(verdict[name].run, name).toBe(lane.hash === 'raw');
    } finally {
      rmSync(repo, {recursive: true, force: true});
    }
  });
});

describe('the CI wiring', () => {
  const ci = read('.github/workflows/ci.yml');
  const stepIf = (name: string): string | undefined =>
    new RegExp(`- name: ${name.replace(/[()+]/g, '\\$&')}\\n\\s+(?:id: \\w+\\n\\s+)?if: (.+)`).exec(ci)?.[1];

  it('runs the checks that read comments on js-static, and the suite on js', () => {
    for (const name of [
      'Check formatting',
      'Lint \\+ typecheck',
      'Code-import check',
      'Typecheck the mion examples',
      'Contract tests',
    ]) {
      expect(new RegExp(`- name: ${name}.*\\n\\s+if: fromJSON\\(env\\.MION_LANES\\)\\['js-static'\\]\\.run`).test(ci), name).toBe(
        true
      );
    }
    for (const name of [
      'JS suite (everything except test/fuzz)',
      'platform-bun suite (bun:test)',
      'Restore the passed test list',
    ]) {
      expect(stepIf(name), name).toBe('fromJSON(env.MION_LANES).js.run');
    }
  });

  it('runs gofmt and vet on go-static', () => {
    for (const name of ['Go formatting (our code only; never third_party)', 'Go vet (our code only; never third_party)']) {
      expect(stepIf(name), name).toBe("fromJSON(env.MION_LANES)['go-static'].run");
    }
  });

  it('restores code-digest in the gate under its own key, and builds it wherever Go is set up', () => {
    const gate = read('.github/actions/ci-lanes/action.yml');
    expect(gate).toContain('node scripts/core/build.mjs --digest-cache-key');
    expect(gate).toMatch(
      /mion-bin\/code-digest\n\s+mion-bin\/\.code-digest\.stamp\n\s+key: \$\{\{ steps\.digest-key\.outputs\.key \}\}/
    );
    expect(gate.indexOf('Restore the code-digest tool')).toBeLessThan(gate.indexOf('Decide the lanes'));
    const resolver = read('.github/actions/resolver/action.yml');
    expect(resolver).toContain('node scripts/core/build.mjs --digest-cache-key');
    expect(resolver).toContain('run: node scripts/core/build.mjs digest');
    expect(resolver).toMatch(/Save the code-digest tool\n\s+if: steps\.restore-digest\.outputs\.cache-hit != 'true'/);
    // A digest miss must set up Go even when the main binaries hit, or the build step runs without it.
    const goSetup = resolver.match(/if: inputs\.toolchain == 'true' \|\| .+/g) ?? [];
    expect(goSetup).toHaveLength(3);
    for (const condition of goSetup) expect(condition).toContain("steps.restore-digest.outputs.cache-hit != 'true'");
  });
});
