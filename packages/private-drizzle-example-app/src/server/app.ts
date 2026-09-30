import type {Server} from 'node:http';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';
import {mionFetchMetadata} from '@mionjs/router/middlewares';
import type {PublicApi} from '@mionjs/router';
import {mion} from './mion.ts';
import {pgBuildersRoutes} from './pg.builders.routes.ts';
import {pgTypesRoutes} from './pg.types.routes.ts';
import {pgDrizzleRoutes} from './pg.drizzle.routes.ts';
import {mysqlBuildersRoutes} from './mysql.builders.routes.ts';
import {mysqlTypesRoutes} from './mysql.types.routes.ts';
import {mysqlDrizzleRoutes} from './mysql.drizzle.routes.ts';
import {sqliteBuildersRoutes} from './sqlite.builders.routes.ts';
import {sqliteTypesRoutes} from './sqlite.types.routes.ts';
import {sqliteDrizzleRoutes} from './sqlite.drizzle.routes.ts';

const routes = {
  mionFetchMetadata,
  pg: {drizzle: pgDrizzleRoutes, types: pgTypesRoutes, builders: pgBuildersRoutes},
  mysql: {drizzle: mysqlDrizzleRoutes, types: mysqlTypesRoutes, builders: mysqlBuildersRoutes},
  sqlite: {drizzle: sqliteDrizzleRoutes, types: sqliteTypesRoutes, builders: sqliteBuildersRoutes},
};

// the only thing the client imports from the server
export type AppApi = PublicApi<typeof routes>;

export async function startApp(port: number): Promise<Server> {
  mion.initRoutes(routes);
  setNodeHttpOpts({port});
  return (await startNodeServer()) as Server;
}
