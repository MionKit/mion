/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
import {
  INPUT_MAPPER_NAMESPACE,
  allowInputMapper,
  getInputMapper,
  hasInputMapper,
  registerInputMapperTuple,
  inputMapperKey,
} from './inputMappers.ts';

describe('server mapper keys', () => {
  it('builds the registry key the batch table references', () => {
    expect(inputMapperKey('toId')).toBe('mionjs::toId');
    expect(INPUT_MAPPER_NAMESPACE).toBe('mionjs');
  });
});

describe('inputFrom mapper resolution (allow-listed registry keys)', () => {
  it('resolves a NAME-lane mapper registered with RunTypes and opted in', () => {
    // registration is upstream's job: a literal key + an inline literal is scanner-clean.
    registerPureFn('mionjs::toId', (v: {id: number}) => v.id);
    allowInputMapper(inputMapperKey('toId'));
    expect(hasInputMapper('mionjs::toId')).toBe(true);
    expect(getInputMapper('mionjs::toId')?.({id: 7})).toBe(7);
  });

  it('resolves an INLINE-lane mapper registered from its generated tuple', () => {
    registerInputMapperTuple('rt::testMapperHash', [
      2,
      undefined,
      undefined,
      'rt::testMapperHash',
      'H',
      [],
      'return (v) => v * 3;',
      [],
    ]);
    expect(hasInputMapper('rt::testMapperHash')).toBe(true);
    expect(getInputMapper('rt::testMapperHash')?.(5)).toBe(15);
  });

  it('never resolves a key nothing registered: there is no lazy re-read to fall back on', () => {
    // the generated module is imported by the server entry, so a batch the server does not know
    // is an unknown id, not a mapper to look up later
    expect(hasInputMapper('rt::neverRegistered')).toBe(false);
    expect(getInputMapper('rt::neverRegistered')).toBeUndefined();
  });
});

// ############# the security property #############
// The mapper key comes out of the batch table (registered from the generated module) and goes
// straight to getInputMapper. The allow-list is the only thing stopping a request from naming an
// arbitrary entry in the SHARED mion registry — built-ins, entries installed by
// addSerializedJitCaches from a metadata payload, or anything an unrelated library registered in
// the same process. These pin that it holds for BOTH namespaces: the gate is lane-of-registration,
// not a namespace check.
describe('table keys cannot reach registry entries outside a mion lane', () => {
  it('rejects an rt:: entry put in the registry directly', () => {
    getRTUtils().addPureFn('rt::sneakyDirectEntry', {
      namespace: 'rt',
      fnName: 'sneakyDirectEntry',
      bodyHash: '',
      paramNames: [],
      code: '',
      pureFnDependencies: [],
      createPureFn: () => () => 'should never be reachable',
    } as never);
    expect(getRTUtils().hasPureFnByKey('rt::sneakyDirectEntry')).toBe(true);
    expect(hasInputMapper('rt::sneakyDirectEntry')).toBe(false);
    expect(getInputMapper('rt::sneakyDirectEntry')).toBeUndefined();
  });

  it('rejects a mionjs:: entry registered upstream WITHOUT allowInputMapper', () => {
    // the realistic near-miss: a correct upstream registration, but nobody opted the key in.
    // Registering must NOT be enough on its own, or the gate is decorative.
    registerPureFnFactory('mionjs::notOptedIn', () => (s: string) => s.toLowerCase());
    expect(getRTUtils().hasPureFnByKey('mionjs::notOptedIn')).toBe(true);
    expect(hasInputMapper('mionjs::notOptedIn')).toBe(false);
    expect(getInputMapper('mionjs::notOptedIn')).toBeUndefined();
  });
});

// ############# the inline lane registers RunTypes' own generated tuple #############
// This is what the generated `.mion/rpc/batches.generated.js` does: it imports the pure-fn module
// RunTypes emitted for the mapper and hands mion the tuple inside it. mion keeps no copy of the
// body, so the entry carries upstream's real bodyHash and its whole dep closure.
describe('registerInputMapperTuple', () => {
  // shape of a generated pure-fn module's export, per PURE_FN_TUPLE_KEYS:
  // [entryKind, deps, ini, key, bodyHash, paramNames, code, pureFnDependencies, createPureFn]
  const tupleFor = (key: string, bodyHash: string, code: string) => [2, undefined, undefined, key, bodyHash, [], code, []];

  it('registers the tuple, keeps its real bodyHash, and opts the key in', () => {
    registerInputMapperTuple('rt::fromTuple', tupleFor('rt::fromTuple', 'REALBODYHASH', 'return (v) => v * 2;'));
    expect(getRTUtils().getCompiledPureFn('rt::fromTuple')?.bodyHash).toBe('REALBODYHASH');
    expect(getInputMapper('rt::fromTuple')?.(21)).toBe(42);
  });

  it('skips a key whose module carried no tuple instead of registering a broken entry', () => {
    // Object.values(mod).find(...) returns undefined when the module does not hold that key —
    // a stale table pointing at a regenerated tree. Better a rejected flow than a bad entry.
    registerInputMapperTuple('rt::missingTuple', undefined);
    expect(hasInputMapper('rt::missingTuple')).toBe(false);
  });

  it('does not make the key reachable under a namespace it was not registered with', () => {
    registerInputMapperTuple('rt::scopedTuple', tupleFor('rt::scopedTuple', 'H', 'return (v) => v;'));
    expect(hasInputMapper('mionjs::scopedTuple')).toBe(false);
  });

  it('re-registering the same tuple on a dev reload is idempotent', () => {
    const tuple = tupleFor('rt::reloaded', 'SAMEHASH', 'return (v) => v + 1;');
    registerInputMapperTuple('rt::reloaded', tuple);
    registerInputMapperTuple('rt::reloaded', tuple);
    expect(getRTUtils().getCompiledPureFn('rt::reloaded')?.bodyHash).toBe('SAMEHASH');
    expect(getInputMapper('rt::reloaded')?.(1)).toBe(2);
  });
});
