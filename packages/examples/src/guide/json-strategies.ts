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

// 'compact': like clone, but drops the key names: {name, age} rides as ["Ada", 36].
// Pair it with the 'compact' decoder, which rebuilds the object from the positions.
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
encodeCompact(messy); // ["Ada",36]: no key names on the wire
decodeCompact('["Ada",36]'); // {name: 'Ada', age: 36}

export {encodeClean, encodeFast, encodeDirect, encodeCompact, decodeCompact};
