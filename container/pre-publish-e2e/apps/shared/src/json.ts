// Family 4 — JSON codec. Mirrors guide/json-basics.ts + json-strategies.ts +
// json-dataonly.ts. Round-trip through Date + Map, the three encoder
// strategies, and the DataOnly decode projection.
import {createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

export interface Session {
  id: string;
  startedAt: Date;
  flags: Map<string, boolean>;
}

interface Profile {
  name: string;
  age: number;
}

export const encodeSession = createJsonEncoderFn<Session>();
export const decodeSession = createJsonDecoderFn<Session>();

// The three strategies: clone (default, strips undeclared), mutate (keeps
// extras), direct (single pass, strips).
export const encodeClone = createJsonEncoderFn<Profile>(undefined, {strategy: 'clone'});
export const encodeMutate = createJsonEncoderFn<Profile>(undefined, {strategy: 'mutate'});
export const encodeDirect = createJsonEncoderFn<Profile>(undefined, {strategy: 'direct'});

export function checkJson(): CheckResult[] {
  const session: Session = {
    id: 's-1',
    startedAt: new Date('2026-01-01T00:00:00Z'),
    flags: new Map([['beta', true]]),
  };
  const wire = encodeSession(session)!;
  const back = decodeSession(wire);
  const messy = {name: 'Ada', age: 36, secret: 'shh'} as Profile & {secret: string};

  return [
    ok('json: encode produces a JSON string', typeof wire === 'string' && wire.length > 0),
    ok('json: Date round-trips as a Date', back.startedAt instanceof Date),
    ok('json: Map round-trips as a Map', back.flags instanceof Map && back.flags.get('beta') === true),
    // clone drops the undeclared key.
    ok('json: clone strategy strips undeclared keys', !encodeClone(messy)!.includes('secret')),
    // mutate keeps it on the wire.
    ok('json: mutate strategy keeps undeclared keys', encodeMutate({...messy})!.includes('secret')),
    ok('json: direct strategy strips undeclared keys', !encodeDirect(messy)!.includes('secret')),
  ];
}
