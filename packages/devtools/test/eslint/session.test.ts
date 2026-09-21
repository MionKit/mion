// Session bridge failure-path tests: a broken engine must surface as an
// engineError outcome (never a hang, never silence) and stick so later files
// don't re-pay the failure.

import {MessagePort} from 'node:worker_threads';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {LintSession} from '../../src/lint/session.ts';
import {LINT_WORKER_REQUEST_KEYS} from '../../src/lint/session-protocol.ts';
import {makeFixtureProject, type FixtureProject} from './fixture.ts';

describe('LintSession failure paths', () => {
  const projects: FixtureProject[] = [];

  afterAll(() => {
    for (const project of projects) project.cleanup();
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
    // Intercept the request before it reaches the worker. Swallowing it leaves
    // the 1ms budget to expire at once, so no resolver ever spawns. Node's own
    // Worker bootstrap writes on a port too, hence the seq filter.
    const spy = vi.spyOn(MessagePort.prototype, 'postMessage').mockImplementation((message: unknown) => {
      const request = message as Record<string, unknown>;
      if (typeof request?.['seq'] === 'number') posted.push(request);
    });
    try {
      // markers is set on purpose: it is a rule-thread pre-filter knob, and the
      // resolver reads marker packages from the tsconfig, so it must not ride here.
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
