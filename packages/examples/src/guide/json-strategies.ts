import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

type Profile = {name: string; age: number};

// start-strategies
const encodeClean = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'clone',
});

const encodeFast = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'mutate',
});

const encodeDirect = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'direct',
});

// {name, age} is written as ["Ada", 36]; the 'compact' decoder reads it back
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
