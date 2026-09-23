import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

// start-roundtrip
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

const wire = encode(session)!; // a JSON string
const back = decode(wire);

back.startedAt instanceof Date; // true
back.roles instanceof Set; // true

// plain JSON.stringify turns the Date into a string and the Set into {}
JSON.stringify(session); // {"id":"s-1","startedAt":"2026-01-01T...","roles":{}}
// end-roundtrip

export {encode, decode, back};
