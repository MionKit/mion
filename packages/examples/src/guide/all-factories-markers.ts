import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

type User = {id: bigint; name: string; signedUpAt: Date};

// start-marker
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
    // the key repeated here is the one named in the marker above
    isValid: getRTFunction<'validate'>(fns?.[0]),
    prepare: getRTFunction<'prepareForJsonClone'>(fns?.[1]),
    restore: getRTFunction<'restoreFromJsonClone'>(fns?.[2]),
    stringify: getRTFunction<'stringifyJson'>(fns?.[3]),
  };
}

// the build injects one handle per name, in the order you listed them
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
