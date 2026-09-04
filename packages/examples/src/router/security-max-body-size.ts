import {initMionRouter} from '@mionjs/router';
import {routes} from './routes-definition.routes.ts';

// One body limit for the whole deployment, in bytes. A platform with a native limit
// (node, uws, bun) uses its own option and the router honours the same number.
await initMionRouter(routes, {
  maxBodySize: 64_000,
});
