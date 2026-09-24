// Family 4, JSON codec. Mirrors guide/serialization-overview.ts + json-strategies.ts + serialization-data-only.ts.
import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
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

// clone (default) drops undeclared keys, mutate keeps them, on both sides.
export const encodeClone = createJsonEncoderFn<Profile>(undefined, {strategy: 'clone'});
export const encodeMutate = createJsonEncoderFn<Profile>(undefined, {strategy: 'mutate'});
export const decodeClone = createJsonDecoderFn<Profile>(undefined, {strategy: 'clone'});
export const decodeMutate = createJsonDecoderFn<Profile>(undefined, {strategy: 'mutate'});

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
    ok('json: clone decoder drops undeclared keys', !('secret' in decodeClone(JSON.stringify(messy)))),
    ok('json: mutate decoder keeps undeclared keys', 'secret' in decodeMutate(JSON.stringify(messy))),
  ];
}
