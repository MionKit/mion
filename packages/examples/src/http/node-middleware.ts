import {createServer} from 'node:http';
import {httpRequestHandler, startNodeServer} from '@mionjs/platform-node';
import {initMionRouter} from '@mionjs/router';
import {routes} from './node-routes.ts';

await initMionRouter(routes, {basePath: 'api'});

// registers the routes and applies the options, but opens NO port: the host owns the socket
await startNodeServer({asMiddleware: true});

// mount mion wherever the host wants it — here, everything under /api
const host = createServer((req, res) => {
  if (req.url?.startsWith('/api')) return httpRequestHandler(req, res);
  res.statusCode = 404;
  res.end('not found');
});

host.listen(3000);
