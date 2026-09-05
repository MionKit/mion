import {createMionRouter, Routes} from '@mionjs/router';

// One body limit for the whole deployment, in bytes. A platform with a native limit
// (node, uws, bun) uses its own option and the router honours the same number.
const mion = createMionRouter({maxBodySize: 64_000});

const routes = {
  upload: mion.route((ctx, payload: string): number => payload.length),
} satisfies Routes;

await mion.initRoutes(routes);
