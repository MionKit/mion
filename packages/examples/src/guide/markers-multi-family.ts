import {createGetValidationErrorsFn, createJsonDecoderFn, createJsonEncoderFn, type InjectTypeFnArgs} from '@ts-runtypes/core';

// A single marker can ask for SEVERAL generated functions at once. A route
// wrapper wants to validate a request, decode it from JSON, and encode the
// response, so it names all three families in one trailing marker. The build
// injects an array of handles, one per family, in the order you listed them.
type Handler = (...args: any[]) => unknown;

function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder', 'jsonEncoder'>) {
  const getErrors = createGetValidationErrorsFn(undefined, undefined, fns?.[0] as never);
  const decodeParams = createJsonDecoderFn(undefined, undefined, fns?.[1] as never);
  const encodeParams = createJsonEncoderFn(undefined, undefined, fns?.[2] as never);
  return {handler, getErrors, decodeParams, encodeParams};
}

// route() runs at a concrete call site, so the build injects the three handles
// for this handler's parameters here.
const greet = route((name: string, times: number) => name.repeat(times));

export {route, greet};
