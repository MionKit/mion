import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

type Profile = {name: string; credits: bigint};

// start-encoder-strategies
const encodeProfile = createJsonEncoderFn<Profile>(undefined, {
  strategy: 'mutate',
});

const profile = {name: 'Ada', credits: 5n};
const json = encodeProfile(profile); // '{"name":"Ada","credits":"5"}'
// profile.credits is now the string '5': mutate writes into your value
// end-encoder-strategies

// start-decoder-strategies
const decodeStrip = createJsonDecoderFn<Profile>(); // strip is the default
const decodeKeep = createJsonDecoderFn<Profile>(undefined, {
  strategy: 'preserve',
});

const wire = '{"name":"Ada","credits":"5","role":"admin"}';
const stripped = decodeStrip(wire); // {name: 'Ada', credits: 5n, role: undefined}
const kept = decodeKeep(wire); // {name: 'Ada', credits: 5n, role: 'admin'}
// end-decoder-strategies

export {json, stripped, kept};
