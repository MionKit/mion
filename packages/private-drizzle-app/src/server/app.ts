import type {Server} from 'node:http';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';
import {mionMethodsMetadata} from '@mionjs/router/middlewares';
import type {PublicApi} from '@mionjs/router';
import {mion} from './mion.ts';
import {pgRoutes} from './pg.routes.ts';
import {sqliteRoutes} from './sqlite.routes.ts';
import {mysqlRoutes} from './mysql.routes.ts';

const routes = {
  mionMethodsMetadata,
  pg: pgRoutes,
  sqlite: sqliteRoutes,
  mysql: mysqlRoutes,
};

// the only thing the client imports from the server
export type AppApi = PublicApi<typeof routes>;

export async function startApp(port: number): Promise<Server> {
  mion.initRoutes(routes);
  setNodeHttpOpts({port});
  return (await startNodeServer()) as Server;
}
