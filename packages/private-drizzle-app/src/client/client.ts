import {initClient} from '@mionjs/client';
import {useMethodsMetadata} from '@mionjs/client/middlewares';
import type {AppApi} from '../server/app.ts';

// A front end: it knows the server only through the AppApi type.

export function createAppClient(baseURL: string) {
  const {routes, middlewares} = initClient<AppApi>({baseURL, validateServerResponses: true});
  useMethodsMetadata(middlewares.mionMethodsMetadata);
  return routes;
}

export type AppClient = ReturnType<typeof createAppClient>;
