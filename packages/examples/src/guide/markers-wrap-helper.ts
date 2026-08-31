import {getRunType, type InjectRunTypeId} from '@mionjs/run-types';

// Wrap ts-runtypes into your OWN helper. Declare a trailing
// `id?: InjectRunTypeId<T>` parameter and the build fills it in at every
// call site: you never pass the id yourself.
function describe<T>(id?: InjectRunTypeId<T>): string {
  // The injected `id` is an OPAQUE handle, not a plain string. Resolve it by
  // forwarding it to a public resolver as the trailing argument: getRunType
  // registers T's type graph and returns the node (getRunTypeId returns the id
  // string). The build leaves this forwarded call untouched.
  const runType = getRunType<T>(undefined, id);
  return `type #${runType.id} (kind ${runType.kind})`;
}

// Call it like any generic function, no id argument in sight.
describe<{id: number; name: string}>();
describe<string[]>();

export {describe};
