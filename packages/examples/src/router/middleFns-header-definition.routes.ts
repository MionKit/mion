import {HeadersSubset, RpcError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {getAuthUser, isAuthorized} from './myAuth.ts';

const mion = createMionRouter();

const routes = {
  // using mion.headersFn to declare request headers, headers param must be next after context
  auth: mion.headersFn(
    async (
      ctx,
      {headers}: HeadersSubset<'Authorization'>
    ): Promise<void | RpcError<'not-authorized'>> => {
      const token = headers.Authorization;
      const me = await getAuthUser(token);
      if (!isAuthorized(me)) {
        return new RpcError({
          type: 'not-authorized',
          publicMessage: 'User is not authorized',
        });
      }
      ctx.shared.auth = {me}; // user is added to ctx to share with other routes and middleware functions
    }
  ),
  // set response headers
  serverName: mion.middleFn((ctx): HeadersSubset<'Server'> => {
    return new HeadersSubset({Server: 'my-server'});
  }),
  // ... other routes and middleware functions
} satisfies Routes;
