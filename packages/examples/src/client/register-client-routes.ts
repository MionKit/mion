import {Routes, initMionRouter} from '@mionjs/router';

const routes = {
    // ... my Application Routes
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = await initMionRouter(routes);

// Export Routes type  (to be used by the client)
export type MyApi = typeof myApi;
