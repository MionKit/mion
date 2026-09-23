import {
  createGetValidationErrorsFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  type InjectTypeFnArgs,
} from '@mionjs/run-types';

type Handler = (...args: any[]) => unknown;

function route<H extends Handler>(
  handler: H,
  // the build injects one handle per family, in this order
  fns?: InjectTypeFnArgs<
    Parameters<H>,
    'validationErrors',
    'jsonDecoder',
    'jsonEncoder'
  >
) {
  const getErrors = createGetValidationErrorsFn(
    undefined,
    undefined,
    fns?.[0] as never
  );
  const decodeParams = createJsonDecoderFn(
    undefined,
    undefined,
    fns?.[1] as never
  );
  const encodeParams = createJsonEncoderFn(
    undefined,
    undefined,
    fns?.[2] as never
  );
  return {handler, getErrors, decodeParams, encodeParams};
}

// the build injects the three handles for this handler's parameters here
const greet = route((name: string, times: number) => name.repeat(times));

export {route, greet};
