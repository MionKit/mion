import {createServer} from 'node:http';
import {httpRequestHandler, startNodeServer} from '@mionjs/platform-node';
import {createMionRouter, Routes} from '@mionjs/router';

// the router's basePath must match the prefix the host forwards
const mion = createMionRouter({basePath: 'api'});
const routes = {
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}!`),
} satisfies Routes;
await mion.initRoutes(routes);

// registers the routes and applies the options, but opens NO port: the host owns the socket
await startNodeServer({asMiddleware: true});

// mount mion wherever the host wants it, here everything under /api
const host = createServer((req, res) => {
  if (req.url?.startsWith('/api')) return httpRequestHandler(req, res);
  res.statusCode = 404;
  res.end('not found');
});

host.listen(3000);
