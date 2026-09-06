import {createMionRouter} from '@mionjs/router';

// The encoder is a router option: pick it once, where the router is created, as a literal. The build
// reads it, so every route compiles only the functions its strategy needs.

// start-default
// No option: params ride as a `direct` string, returns as a `mutate`d value (today's wire).
export const defaultMion = createMionRouter({basePath: 'api'});
// end-default

// start-clone
// 'clone' builds a fresh JSON value from the type. Never touches your objects, drops unknown keys.
export const cloneMion = createMionRouter({encoder: 'clone'});
// end-clone

// start-mutate
// 'mutate' rewrites Dates, Maps and the like in place: no allocation, keeps unknown keys, but it
// changes the object you return.
export const mutateMion = createMionRouter({encoder: 'mutate'});
// end-mutate

// start-direct
// 'direct' writes the JSON string in one pass. Never mutates, drops unknown keys.
export const directMion = createMionRouter({encoder: 'direct'});
// end-direct

// start-compact
// 'compact' drops the key names: an object rides as an array of its declared properties, in order.
// 40 to 60 percent fewer bytes on real objects. Both ends must share the type, like binary.
export const compactMion = createMionRouter({encoder: 'compact'});
// end-compact

// start-binary
// 'binary' produces the smallest payload. The JSON pair stays compiled beside it, so the first
// call of a route and any client that cannot do binary still work.
export const binaryMion = createMionRouter({encoder: 'binary'});
// end-binary

// start-per-direction
// One strategy per direction: the client sends compact params, the server answers a direct string.
export const mixedMion = createMionRouter({
  encoder: {params: 'compact', return: 'direct'},
});
// end-per-direction
