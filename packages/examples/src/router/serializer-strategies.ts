import {createMionRouter} from '@mionjs/router';

// no serializer option: `clone` on both directions, so only what the types declare reaches the wire
export const defaultMion = createMionRouter({basePath: 'api'});

// one strategy for both directions
export const compactMion = createMionRouter({serializer: 'compact'});

// or one strategy per direction
export const mixedMion = createMionRouter({
  serializer: {params: 'compact', return: 'mutate'},
});
