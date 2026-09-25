// patternSampleCount reaches the resolver: a pattern with no mockSamples gets exactly that many generated samples.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import {BIN, createMarkerProject, hasBinary} from './helpers/inline.ts';

// Distinctive on purpose, so a default pool size can never pass by accident.
const SAMPLE_COUNT = 7;
const SOURCE = '^[a-z]{3}-[0-9]{2}$';

const CONSUMER = `import {getRunTypeId} from '@mionjs/run-types';
import type {String} from '@mionjs/run-types/formats';
type Sku = String<{pattern: {source: '${SOURCE}'}}>;
export const id = getRunTypeId<Sku>();
`;

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function readTree(dir: string): string {
  return fs
    .readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

describe('patternSampleCount', () => {
  const register = hasBinary() ? it : it.skip;
  let fixtureDir = '';

  beforeEach(() => {
    fixtureDir = createMarkerProject('rt-pattern-count-');
    fs.writeFileSync(path.join(fixtureDir, 'consumer.ts'), CONSUMER);
  });
  afterEach(() => fs.rmSync(fixtureDir, {recursive: true, force: true}));

  register('generates a pool of exactly patternSampleCount samples', async () => {
    const genDir = path.join(fixtureDir, '.mion');
    const plugin = runtypesRollup({
      binary: BIN,
      cwd: fixtureDir,
      tsconfig: 'tsconfig.json',
      genDir,
      patternSampleCount: SAMPLE_COUNT,
    }) as any;
    try {
      await callHook(plugin.buildStart, ctx);
    } finally {
      await Promise.resolve(callHook(plugin.buildEnd, ctx)).catch(() => {});
    }
    const emitted = readTree(path.join(genDir, 'types'));
    const match = /mockSamples":\s*(\[[^\]]*\])/.exec(emitted) ?? /mockSamples:\s*(\[[^\]]*\])/.exec(emitted);
    expect(match, 'no generated mockSamples in the emitted cache').not.toBeNull();
    const samples = JSON.parse(match![1]) as string[];
    expect(samples).toHaveLength(SAMPLE_COUNT);
    for (const sample of samples) expect(sample).toMatch(new RegExp(SOURCE));
  });
});
