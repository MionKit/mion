import {createMionRouter} from '@mionjs/router';

// no parser option: `clone` on both directions, so only what the types declare reaches the wire
export const defaultMion = createMionRouter({basePath: 'api'});

// one strategy for both directions
export const compactMion = createMionRouter({parser: 'compact'});

// or one strategy per direction
export const mixedMion = createMionRouter({
  parser: {params: 'compact', return: 'mutate'},
});
