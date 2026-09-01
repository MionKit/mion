/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
import {
  SERVER_MAPPER_NAMESPACE,
  allowServerMapper,
  getServerMapper,
  hasServerMapper,
  installServerMapperReader,
  registerServerMapperTuple,
  registerServerMappers,
  serverMapperKey,
} from './serverMappers.ts';

describe('server mapper keys', () => {
  it('builds the wire key the client puts in the routesFlow query', () => {
    expect(serverMapperKey('toId')).toBe('mionjs::toId');
    expect(SERVER_MAPPER_NAMESPACE).toBe('mionjs');
  });
});

describe('serverMapFrom mapper resolution (allow-listed registry keys)', () => {
  it('resolves a NAME-lane mapper registered with RunTypes and opted in', () => {
    // registration is upstream's job: a literal key + an inline literal is scanner-clean.
    registerPureFn('mionjs::toId', (v: {id: number}) => v.id);
    allowServerMapper(serverMapperKey('toId'));
    expect(hasServerMapper('mionjs::toId')).toBe(true);
    expect(getServerMapper('mionjs::toId')?.({id: 7})).toBe(7);
  });

  it('resolves an INLINE-lane mapper registered from the harvested manifest', () => {
    registerServerMappers([{key: 'rt::testMapperHash', paramNames: [], code: 'return (v) => v * 3;'}]);
    expect(hasServerMapper('rt::testMapperHash')).toBe(true);
    expect(getServerMapper('rt::testMapperHash')?.(5)).toBe(15);
  });

  it('skips manifest entries without a code payload instead of registering them', () => {
    registerServerMappers([{key: 'rt::noCodeEntry'}]);
    expect(hasServerMapper('rt::noCodeEntry')).toBe(false);
  });

  it('re-reads the manifest on a miss, so mappers registered after install still resolve', () => {
    const entries: {key: string; paramNames: string[]; code: string}[] = [];
    installServerMapperReader(() => entries);
    expect(hasServerMapper('rt::lateEntry')).toBe(false);
    // the manifest gains an entry after install — the next miss must re-read, not stay stale
    entries.push({key: 'rt::lateEntry', paramNames: [], code: 'return (v) => v + 1;'});
    expect(getServerMapper('rt::lateEntry')?.(1)).toBe(2);
  });
});

// ############# the security property #############
// The mapper key arrives on the wire (URL query, JSON.parse'd with no schema validation) and goes
// straight to getServerMapper. The allow-list is the only thing stopping a request from naming an
// arbitrary entry in the SHARED mion registry — built-ins, entries installed by
// addSerializedJitCaches from a metadata payload, or anything an unrelated library registered in
// the same process. These pin that it holds for BOTH namespaces: the gate is lane-of-registration,
// not a namespace check.
describe('wire keys cannot reach registry entries outside a mion lane', () => {
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
    expect(hasServerMapper('rt::sneakyDirectEntry')).toBe(false);
    expect(getServerMapper('rt::sneakyDirectEntry')).toBeUndefined();
  });

  it('rejects a mionjs:: entry registered upstream WITHOUT allowServerMapper', () => {
    // the realistic near-miss: a correct upstream registration, but nobody opted the key in.
    // Registering must NOT be enough on its own, or the gate is decorative.
    registerPureFnFactory('mionjs::notOptedIn', () => (s: string) => s.toLowerCase());
    expect(getRTUtils().hasPureFnByKey('mionjs::notOptedIn')).toBe(true);
    expect(hasServerMapper('mionjs::notOptedIn')).toBe(false);
    expect(getServerMapper('mionjs::notOptedIn')).toBeUndefined();
  });
});

// ############# the inline lane registers RunTypes' own generated tuple #############
// This is what the generated `.mion/server-mappers.generated.js` does in build mode: it imports the
// pure-fn module RunTypes emitted for the mapper and hands mion the tuple inside it. mion keeps
// no copy of the body, so the entry carries upstream's real bodyHash and its whole dep closure.
describe('registerServerMapperTuple', () => {
  // shape of a generated pure-fn module's export, per PURE_FN_TUPLE_KEYS:
  // [entryKind, deps, ini, key, bodyHash, paramNames, code, pureFnDependencies, createPureFn]
  const tupleFor = (key: string, bodyHash: string, code: string) => [2, undefined, undefined, key, bodyHash, [], code, []];

  it('registers the tuple, keeps its real bodyHash, and opts the key in', () => {
    registerServerMapperTuple('rt::fromTuple', tupleFor('rt::fromTuple', 'REALBODYHASH', 'return (v) => v * 2;'));
    expect(getRTUtils().getCompiledPureFn('rt::fromTuple')?.bodyHash).toBe('REALBODYHASH');
    expect(getServerMapper('rt::fromTuple')?.(21)).toBe(42);
  });

  it('skips a key whose module carried no tuple instead of registering a broken entry', () => {
    // Object.values(mod).find(...) returns undefined when the module does not hold that key —
    // a stale manifest pointing at a regenerated tree. Better a rejected flow than a bad entry.
    registerServerMapperTuple('rt::missingTuple', undefined);
    expect(hasServerMapper('rt::missingTuple')).toBe(false);
  });

  it('does not make the key reachable under a namespace it was not registered with', () => {
    registerServerMapperTuple('rt::scopedTuple', tupleFor('rt::scopedTuple', 'H', 'return (v) => v;'));
    expect(hasServerMapper('mionjs::scopedTuple')).toBe(false);
  });
});

// ############# mion never fabricates upstream's bodyHash #############
// Upstream's CompiledPureFunction.bodyHash is a content hash of the function BODY. mion's wire
// `bodyHash` (PureFnRef) is the full registry key. registerServerMappers used to write the key's
// fn-name half into upstream's field, which is neither of those. The second case below is what makes
// the wrong value harmless today — registerServerMappers returns early on an existing key, so it
// never reaches the addPureFn hash comparison that would warn and replace. Both are pinned: the value
// is honest, and the deference to a generated entry that supplies the real hash is deliberate.
describe('harvested entries do not fabricate upstream bodyHash', () => {
  it('leaves bodyHash empty rather than reusing the key', () => {
    registerServerMappers([{key: 'rt::noFabricatedHash', paramNames: [], code: 'return (v) => v;'}]);
    expect(getRTUtils().getCompiledPureFn('rt::noFabricatedHash')?.bodyHash).toBe('');
  });

  it('does not clobber an entry already registered from a generated pure-fn tuple', () => {
    // What upstream's tuple lane installs for a generated pf/<ns>/<key>.js module: the real body
    // and the real body hash. Written through addPureFn rather than `registerPureFn(key, tuple)`
    // because the mion scanner rejects a non-literal 2nd argument (PFN001) anywhere inside
    // the TS program — that lane is reachable only from generated .js outside it.
    getRTUtils().addPureFn('rt::generatedWins', {
      namespace: 'rt',
      fnName: 'generatedWins',
      bodyHash: 'REALBODYHASH',
      paramNames: [],
      code: 'return (v) => v * 2;',
      pureFnDependencies: [],
    } as never);
    // a stale manifest row for the same key must not replace it
    registerServerMappers([{key: 'rt::generatedWins', paramNames: [], code: 'return (v) => v;'}]);
    const compiled = getRTUtils().getCompiledPureFn('rt::generatedWins');
    expect(compiled?.bodyHash).toBe('REALBODYHASH');
    expect(getServerMapper('rt::generatedWins')?.(21)).toBe(42);
  });
});
