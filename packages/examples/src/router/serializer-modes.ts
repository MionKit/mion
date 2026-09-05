import {createMionRouter} from '@mionjs/router';

// The serializer is a router option: pick it once, where the router is created.

// start-json
// 'json' is the default: fastest, mutates the value in place, keeps unknown properties.
export const jsonMion = createMionRouter({serializer: 'json'});
// end-json

// start-stringify-json
// 'stringifyJson' never mutates the value and drops properties the type does not declare.
export const stringifyJsonMion = createMionRouter({
  serializer: 'stringifyJson',
});
// end-stringify-json

// start-binary
// 'binary' produces the smallest payload and, like stringifyJson, leaves the value untouched.
export const binaryMion = createMionRouter({serializer: 'binary'});
// end-binary
