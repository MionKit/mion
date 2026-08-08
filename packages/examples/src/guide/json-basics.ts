import {createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';

// A type with members JSON.stringify quietly mangles: a Date and a Map.
type Session = {
  id: string;
  startedAt: Date;
  flags: Map<string, boolean>;
};

const session: Session = {
  id: 's-1',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  flags: new Map([['beta', true]]),
};

// start-roundtrip
const encode = createJsonEncoderFn<Session>();
const decode = createJsonDecoderFn<Session>();

const wire = encode(session)!; // a JSON string: Date and Map survive
const back = decode(wire); // Date is a Date again, Map is a Map again

back.startedAt instanceof Date; // true
back.flags instanceof Map; // true
// end-roundtrip

// start-why
// Plain JSON.stringify can't do this: your Date turns into a string and
// your Map turns into {} on the way out, and never comes back.
JSON.stringify(session); // {"id":"s-1","startedAt":"2026-01-01T...","flags":{}}
// end-why

export {encode, decode, back};
