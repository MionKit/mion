// Session bridge failure-path tests: a broken engine must surface as an
// engineError outcome (never a hang, never silence) and stick so later files
// don't re-pay the failure.

import {MessagePort} from 'node:worker_threads';
import {chmodSync} from 'node:fs';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {LintSession} from '../../src/lint/session.ts';
import {LINT_WORKER_REQUEST_KEYS} from '../../src/lint/session-protocol.ts';
import {BIN, makeFixtureProject, type FixtureProject} from './fixture.ts';

describe('LintSession failure paths', () => {
  const projects: FixtureProject[] = [];

  afterAll(() => {
    for (const project of projects) project.cleanup();
  });

  it('skips files excluded by the compiler and keeps checking supported files', () => {
    const project = makeFixtureProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', allowJs: false, noEmit: true},
        include: ['*.ts'],
      }),
      'launcher.mjs': "import {value} from './helper.js'; export const result = value;",
      'helper.js': 'export const value = 1;',
      'supported.ts': "import {createValidateFn} from '@mionjs/run-types'; export const check = createValidateFn<symbol>();",
    });
    projects.push(project);
    const session = new LintSession();
    const options = {binary: BIN, tsconfig: `${project.dir}/tsconfig.json`};
    try {
      expect(session.lintFileSync(`${project.dir}/launcher.mjs`, project.read('launcher.mjs'), options)).toEqual({
        diagnostics: [],
      });
      const result = session.lintFileSync(`${project.dir}/supported.ts`, project.read('supported.ts'), options);
      expect('diagnostics' in result && result.diagnostics.some((diagnostic) => diagnostic.code === 'validate-symbol-root')).toBe(
        true
      );
    } finally {
      session.dispose();
    }
  });

  it('checks authored JavaScript schemas when allowJs is enabled', () => {
    const project = makeFixtureProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', allowJs: true, noEmit: true},
        include: ['*.mjs'],
      }),
      'node_modules/@mionjs/drizzle-orm-pg-core/package.json': JSON.stringify({
        name: '@mionjs/drizzle-orm-pg-core',
        types: 'index.d.ts',
      }),
      'node_modules/@mionjs/drizzle-orm-pg-core/index.d.ts':
        'export interface PgTable<Name extends string,Cols>{name:Name;columns:Cols}\nexport function pgTable<Name extends string,Cols>(name:Name,columns:Cols):PgTable<Name,Cols>;',
      'node_modules/drizzle-orm/package.json': JSON.stringify({name: 'drizzle-orm', types: 'index.d.ts'}),
      'node_modules/drizzle-orm/index.d.ts': 'export function sql():string;',
      'schema.mjs':
        "import {pgTable} from '@mionjs/drizzle-orm-pg-core'; import {sql} from 'drizzle-orm'; export const users = pgTable('users',{id:1});",
    });
    projects.push(project);
    const session = new LintSession();
    try {
      const result = session.lintFileSync(`${project.dir}/schema.mjs`, project.read('schema.mjs'), {
        binary: BIN,
        tsconfig: `${project.dir}/tsconfig.json`,
      });
      expect('diagnostics' in result && result.diagnostics.some((diagnostic) => diagnostic.code === 'drizzle-mixed-types')).toBe(
        true
      );
    } finally {
      session.dispose();
    }
  });

  it('surfaces a missing TypeScript source as an engine error', () => {
    const project = makeFixtureProject({'a.ts': 'export const a = 1;'});
    projects.push(project);
    const binary = project.write(
      'resolver.mjs',
      `#!${process.execPath}
import {createInterface} from 'node:readline';
createInterface({input: process.stdin}).on('line', (line) => {
  const request = JSON.parse(line);
  const response = request.op === 'scanFiles' ? {error: 'source file not in program: ' + request.files[0]} : {};
  console.log(JSON.stringify(response));
});`
    );
    chmodSync(binary, 0o755);
    const session = new LintSession();
    try {
      const result = session.lintFileSync(`${project.dir}/a.ts`, project.read('a.ts'), {binary});
      expect('engineError' in result && result.engineError).toContain('source file not in program:');
    } finally {
      session.dispose();
    }
  });

  it('surfaces a stuck engine as an engineError, quickly and stickily', {timeout: 30_000}, () => {
    const project = makeFixtureProject({'a.ts': 'export const a = 1;'});
    projects.push(project);
    const session = new LintSession();
    try {
      // A 1ms budget can't cover the cold child spawn + Program build, so the
      // first file times out — the session must report it (never hang) and go
      // sticky so later files answer instantly from the dead flag. (The binary
      // and cwd are resolved transparently now; timeoutMs is the only knob.)
      const options = {timeoutMs: 1};
      const first = session.lintFileSync(`${project.dir}/a.ts`, 'export const a = 1;', options);
      expect('engineError' in first).toBe(true);

      const start = Date.now();
      const second = session.lintFileSync(`${project.dir}/b.ts`, 'export const b = 2;', options);
      expect('engineError' in second).toBe(true);
      expect(Date.now() - start).toBeLessThan(250);
    } finally {
      session.dispose();
    }
  });
});

describe('LintSession worker request shape', () => {
  const projects: FixtureProject[] = [];

  afterAll(() => {
    for (const project of projects) project.cleanup();
  });

  it('posts exactly the declared fields, and never the markers setting', {timeout: 30_000}, () => {
    const project = makeFixtureProject({'a.ts': 'export const a = 1;'});
    projects.push(project);
    const session = new LintSession();
    const posted: Record<string, unknown>[] = [];
    // Swallowing the request lets the 1ms budget expire at once, so no resolver spawns.
    // Node's own Worker bootstrap writes on a port too, hence the seq filter.
    const spy = vi.spyOn(MessagePort.prototype, 'postMessage').mockImplementation((message: unknown) => {
      const request = message as Record<string, unknown>;
      if (typeof request?.['seq'] === 'number') posted.push(request);
    });
    try {
      // markers is set on purpose: the resolver reads marker packages from the tsconfig, not the request.
      session.lintFileSync(`${project.dir}/a.ts`, 'export const a = 1;', {
        timeoutMs: 1,
        tsconfig: 'tsconfig.json',
        markers: {packages: ['@acme/own-markers']},
      });
    } finally {
      spy.mockRestore();
      session.dispose();
    }

    expect(posted).toHaveLength(1);
    expect(Object.keys(posted[0]!).sort()).toEqual([...LINT_WORKER_REQUEST_KEYS].sort());
    expect(posted[0]).not.toHaveProperty('markers');
  });
});
