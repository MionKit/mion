import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

type User = {id: bigint; name: string; signedUpAt: Date};

// start-marker
// One marker can name several functions. Useful in a wrapper of your own, where
// calling four factories would mean four call sites the build has to see.
function userCodec<T>(
  fns?: InjectTypeFnArgs<
    T,
    'validate',
    'prepareForJsonClone',
    'restoreFromJsonClone',
    'stringifyJson'
  >
) {
  return {
    // The key you pass here is the key you named in the marker.
    isValid: getRTFunction<'validate'>(fns?.[0]),
    prepare: getRTFunction<'prepareForJsonClone'>(fns?.[1]),
    restore: getRTFunction<'restoreFromJsonClone'>(fns?.[2]),
    stringify: getRTFunction<'stringifyJson'>(fns?.[3]),
  };
}

// The build injects one handle per name, in the order you listed them.
const codec = userCodec<User>();

const user: User = {
  id: 42n,
  name: 'Ada',
  signedUpAt: new Date('2026-01-01T00:00:00Z'),
};
const wire = JSON.stringify(codec.prepare(user));
const back = codec.restore(JSON.parse(wire));
// end-marker

export {userCodec, codec, back};
