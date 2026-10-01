import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  auth: mion.headersFn(
    (ctx, {headers}: HeadersSubset<'Authorization'>): void => {
      console.log('token', headers.Authorization);
    }
  ),
  // returns a header, not a body value
  getDownloadUrl: mion.route(
    (ctx, fileId: string): HeadersSubset<'x-download-url'> =>
      new HeadersSubset({'x-download-url': `/files/${fileId}`})
  ),
} satisfies Routes;

const api = mion.initRoutes(routes);

export type HeadersApi = typeof api;
