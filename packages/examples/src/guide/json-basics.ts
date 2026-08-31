import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

// start-roundtrip
// A type with members JSON.stringify quietly mangles: a Date and a Set.
type Session = {
  id: string;
  startedAt: Date;
  roles: Set<string>;
};

const session: Session = {
  id: 's-1',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  roles: new Set(['admin', 'editor']),
};

const encode = createJsonEncoderFn<Session>();
const decode = createJsonDecoderFn<Session>();

const wire = encode(session)!; // a JSON string: Date and Set survive
const back = decode(wire); // Date is a Date again, Set is a Set again

back.startedAt instanceof Date; // true
back.roles instanceof Set; // true
// end-roundtrip

// start-why
// Plain JSON.stringify can't do this: your Date turns into a string and
// your Set turns into {} on the way out, and never comes back.
JSON.stringify(session); // {"id":"s-1","startedAt":"2026-01-01T...","roles":{}}
// end-why

export {encode, decode, back};
