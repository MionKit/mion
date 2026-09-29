// An engine failure must reach the user even when a config turns `mion/error` off. A 1 ms budget cannot cover
// the resolver start, so every lint in this file gets an engine error; the file runs in its own session.
import {afterAll, describe, expect, it} from 'vitest';
import {rules} from '../../src/lint/index.ts';
import {makeFixtureProject, runRule} from './fixture.ts';

const SOURCE = `import {getRunTypeId} from '@mionjs/run-types';
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;

describe('an engine failure with mion/error turned off', () => {
  const project = makeFixtureProject({'a.ts': SOURCE});
  const settings = {mion: {timeoutMs: 1}};
  afterAll(() => project.cleanup());

  it('is reported once, by the first enabled rule that lints the file', {timeout: 30_000}, () => {
    const file = `${project.dir}/a.ts`;
    const warning = runRule(rules['warning'], file, SOURCE, settings);
    const runtimeError = runRule(rules['runtime-error'], file, SOURCE, settings);
    expect(warning).toHaveLength(1);
    expect(warning[0]!.message).toMatch(/^\[mion\] /);
    expect(runtimeError).toEqual([]);
  });
});
