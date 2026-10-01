import {createMionRouter} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';

// sent on every response, errors included
createMionRouter({globalResponseHeaders: {'x-api': 'store'}});

await startNodeServer({
  port: 3000,
  defaultResponseHeaders: {'x-api': 'store-node'},
});
