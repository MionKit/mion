/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFn} from '@mionjs/run-types';
import {getInputMapper, hasInputMapper, registerInputMapperTuple} from './inputMappers.ts';

// A mapper id is the pure fn's own id: where the client wrote it. These fixtures
// spell out ids a client build would produce.
const MAPPER = '@acme/app/src/batches#';

// Registered through RunTypes' own registrar rather than the mion tuple lane, so
// the gate below has a realistic near-miss to reject.
const notOptedIn = registerPureFn((s: string): string => s.toLowerCase());

describe('inputFrom mapper resolution (allow-listed ids)', () => {
  it('resolves a mapper registered from its generated tuple', () => {
    registerInputMapperTuple(`${MAPPER}testMapper`, [
      2,
      undefined,
      undefined,
      `${MAPPER}testMapper`,
      [],
      'return (v) => v * 3;',
      [],
    ]);
    expect(hasInputMapper(`${MAPPER}testMapper`)).toBe(true);
    expect(getInputMapper(`${MAPPER}testMapper`)?.(5)).toBe(15);
  });

  it('never resolves an id nothing registered: there is no lazy re-read to fall back on', () => {
    // the generated module is imported by the server entry, so a batch the server does not know
    // is an unknown id, not a mapper to look up later
    expect(hasInputMapper(`${MAPPER}neverRegistered`)).toBe(false);
    expect(getInputMapper(`${MAPPER}neverRegistered`)).toBeUndefined();
  });
});

// ############# the security property #############
// The mapper id comes out of the batch table (registered from the generated module) and goes
// straight to getInputMapper. The allow-list is the only thing stopping a request from naming an
// arbitrary entry in the SHARED mion registry — built-ins, entries installed by
// addSerializedJitCaches from a metadata payload, or anything an unrelated library registered in
// the same process. These pin that the gate is LANE OF REGISTRATION, never who owns the id.
describe('table ids cannot reach registry entries outside a mion lane', () => {
  it('rejects an entry put in the registry directly', () => {
    const sneaky = `${MAPPER}sneakyDirectEntry`;
    getRTUtils().addPureFn(sneaky, {
      id: sneaky,
      paramNames: [],
      code: '',
      pureFnDependencies: [],
      createPureFn: () => () => 'should never be reachable',
    } as never);
    expect(getRTUtils().hasPureFnByKey(sneaky)).toBe(true);
    expect(hasInputMapper(sneaky)).toBe(false);
    expect(getInputMapper(sneaky)).toBeUndefined();
  });

  it('rejects an entry registered upstream but never handed to the tuple lane', () => {
    // the realistic near-miss: a correct upstream registration, but it never came through
    // registerInputMapperTuple. Registering must NOT be enough on its own, or the gate is decorative.
    expect(getRTUtils().hasPureFnByKey(notOptedIn)).toBe(true);
    expect(hasInputMapper(notOptedIn)).toBe(false);
    expect(getInputMapper(notOptedIn)).toBeUndefined();
  });
});

// ############# the lane registers RunTypes' own generated tuple #############
// This is what the generated `.mion/rpc/batches.generated.js` does: it imports the pure-fn module
// RunTypes emitted for the mapper and hands mion the tuple inside it. mion keeps no copy of the
// body, so the entry carries upstream's real code and its whole dep closure.
describe('registerInputMapperTuple', () => {
  // shape of a generated pure-fn module's export, per PURE_FN_TUPLE_KEYS:
  // [entryKind, deps, ini, id, paramNames, code, pureFnDependencies, createPureFn]
  const tupleFor = (id: string, code: string) => [2, undefined, undefined, id, [], code, []];

  it('registers the tuple, keeps its real code, and opts the id in', () => {
    const id = `${MAPPER}fromTuple`;
    registerInputMapperTuple(id, tupleFor(id, 'return (v) => v * 2;'));
    expect(getRTUtils().getCompiledPureFnByKey(id)?.code).toBe('return (v) => v * 2;');
    expect(getInputMapper(id)?.(21)).toBe(42);
  });

  it('skips an id whose module carried no tuple instead of registering a broken entry', () => {
    // Object.values(mod).find(...) returns undefined when the module does not hold that id —
    // a stale table pointing at a regenerated tree. Better a rejected flow than a bad entry.
    registerInputMapperTuple(`${MAPPER}missingTuple`, undefined);
    expect(hasInputMapper(`${MAPPER}missingTuple`)).toBe(false);
  });

  it('does not make the id reachable under a different location', () => {
    const id = `${MAPPER}scopedTuple`;
    registerInputMapperTuple(id, tupleFor(id, 'return (v) => v;'));
    expect(hasInputMapper('@acme/other/src/batches#scopedTuple')).toBe(false);
  });

  it('re-registering the same tuple on a dev reload is idempotent', () => {
    const id = `${MAPPER}reloaded`;
    const tuple = tupleFor(id, 'return (v) => v + 1;');
    registerInputMapperTuple(id, tuple);
    registerInputMapperTuple(id, tuple);
    expect(getRTUtils().getCompiledPureFnByKey(id)?.code).toBe('return (v) => v + 1;');
    expect(getInputMapper(id)?.(1)).toBe(2);
  });
});
