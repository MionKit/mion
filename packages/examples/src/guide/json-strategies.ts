import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

type Profile = {name: string; age: number};

// start-strategies
// 'clone' (default): builds a fresh value from the declared shape, so
// undeclared keys are dropped for free. Never touches your input.
const encodeClean = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'clone',
});

// 'mutate': transforms leaves in place (no clone), and KEEPS undeclared keys
// on the wire. Fastest, but it mutates the object you pass in.
const encodeFast = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'mutate',
});

// 'direct': single pass, no clone, always strips undeclared keys.
const encodeDirect = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'direct',
});

// 'compact': like 'clone', but every object goes out as a positional array with
// no key names, so the JSON is smaller. Pairs with the 'compact' decoder, which
// rebuilds the keyed object from the positions.
const encodeCompact = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'compact',
});
const decodeCompact = createJsonDecoderFn<Profile>(undefined, {
  strategy: 'compact',
});
// end-strategies

const messy = {name: 'Ada', age: 36, secret: 'shh'} as Profile;

encodeClean(messy); // {"name":"Ada","age":36}: secret dropped
encodeDirect(messy); // {"name":"Ada","age":36}, secret dropped
encodeCompact(messy); // ["Ada",36]: positional, secret dropped
decodeCompact('["Ada",36]'); // {name: 'Ada', age: 36}

export {encodeClean, encodeFast, encodeDirect, encodeCompact, decodeCompact};
