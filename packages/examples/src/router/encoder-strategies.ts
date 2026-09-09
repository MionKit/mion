import {createMionRouter} from '@mionjs/router';

// The encoder is a router option: pick it once, as a literal. The build reads it, so every route
// compiles only the functions its strategy needs.

// start-default
// No option: `clone` on both directions. Never touches your objects, and only what the types
// declare reaches the wire.
export const defaultMion = createMionRouter({basePath: 'api'});
// end-default

// start-compact
// 'compact' drops the key names: an object rides as an array of its declared properties, in order.
// 40 to 60 percent fewer bytes on real objects. Both ends must share the type.
export const compactMion = createMionRouter({encoder: 'compact'});
// end-compact

// start-per-direction
// One strategy per direction: the client sends compact params, the server answers a direct string.
export const mixedMion = createMionRouter({
  encoder: {params: 'compact', return: 'direct'},
});
// end-per-direction
