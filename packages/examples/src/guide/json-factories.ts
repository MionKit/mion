import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

type User = {
  id: string;
  name: string;
  signedUpAt: Date;
};

const user: User = {id: 'u-1', name: 'Ada', signedUpAt: new Date('2026-01-01T00:00:00Z')};

// start-encoder
// One call per type, at module level: the encoder is compiled at build time.
const encodeUser = createJsonEncoderFn<User>();

const json = encodeUser(user); // a JSON string, or undefined if you pass undefined

// The second argument is the options bag. `strategy` picks how the value is
// walked, `mutate` being the fastest when you don't mind the input changing.
const encodeFast = createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
encodeFast(user);
// end-encoder

// start-decoder
// The other half, built from the same type.
const decodeUser = createJsonDecoderFn<User>();

const back = decodeUser(json!); // signedUpAt is a Date again, typed as DataOnly<User>

// `strategy: 'preserve'` keeps properties your type doesn't declare,
// the default `strip` drops them.
const decodeLoose = createJsonDecoderFn<User>(undefined, {strategy: 'preserve'});
decodeLoose(json!);
// end-decoder

export {encodeUser, encodeFast, decodeUser, decodeLoose, json, back};
