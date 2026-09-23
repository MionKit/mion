import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

type User = {
  id: string;
  name: string;
  signedUpAt: Date;
};

const user: User = {
  id: 'u-1',
  name: 'Ada',
  signedUpAt: new Date('2026-01-01T00:00:00Z'),
};

// start-encoder
const encodeUser = createJsonEncoderFn<User>();

const json = encodeUser(user); // a JSON string, or undefined if you pass undefined
// end-encoder

const encodeFast = createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
encodeFast(user);

// start-decoder
const decodeUser = createJsonDecoderFn<User>();

const back = decodeUser(json!); // signedUpAt is a Date again

// 'preserve' keeps undeclared properties, the default 'strip' drops them
const decodeLoose = createJsonDecoderFn<User>(undefined, {
  strategy: 'preserve',
});
decodeLoose(json!);
// end-decoder

export {encodeUser, encodeFast, decodeUser, decodeLoose, json, back};
