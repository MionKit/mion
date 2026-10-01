import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

// start-round-trip
type Session = {
  user: string;
  expiresAt: Date;
  roles: Set<string>;
};

const toJson = createJsonEncoderFn<Session>();
const fromJson = createJsonDecoderFn<Session>();

const wire = toJson({
  user: 'ada',
  expiresAt: new Date(),
  roles: new Set(['admin']),
})!;
const back = fromJson(wire);

const expiresAt: Date = back.expiresAt; // a real Date again
const roles: Set<string> = back.roles; // a real Set again
// end-round-trip

export {wire, back, expiresAt, roles};
