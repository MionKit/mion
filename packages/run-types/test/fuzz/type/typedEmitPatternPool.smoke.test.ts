// TE1 regression (release gate run 39249346902): a sample-less pattern re-rolls its mockSamples pool every build,
// so the emitMode 'ts' and 'both' compiles carry different pools and strip parity must hold anyway.
import {describe, expect, it} from 'vitest';
import {compileType, generateModules, hasBinary, openClient, renderFixture} from './typeFuzzHarness.ts';
import type {GeneratedType} from '../core/typeGen.ts';
import {stripParityViolation} from '../../../../devtools/test/helpers/typedEmit.ts';

const emailish: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [{name: 'e', optional: false, readonly: false, method: false, shape: {kind: 'format', name: 'emailish'}}],
  },
};

const pools = (modules: Record<string, string>) =>
  Object.values(modules).flatMap((code) => code.match(/"mockSamples":\[[^\]]*\]/g) ?? []);

describe('typed emit with a generated pattern pool', () => {
  (hasBinary() ? it : it.skip)(
    'strips to emitMode both though each build draws its own pool',
    async () => {
      const both = openClient('both');
      const typed = openClient('ts');
      try {
        const compiled = await compileType(both, emailish);
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        const typedModules = await generateModules(typed, renderFixture(emailish));
        // Anti-vacuity: the two builds really drew different pools.
        expect(pools(typedModules).length).toBeGreaterThan(0);
        expect(pools(typedModules)).not.toEqual(pools(compiled.entryModules));
        for (const [name, typedModule] of Object.entries(typedModules)) {
          if (name.startsWith('t/')) continue;
          expect(stripParityViolation(name, typedModule, compiled.entryModules[name] ?? '')).toBeNull();
        }
      } finally {
        both.close();
        typed.close();
      }
    },
    120_000
  );
});
