import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {HeadersApi} from '../router/headers-api.routes.ts';

const {routes, middlewares} = initClient<HeadersApi>({
  baseURL: 'http://localhost:3000',
  // plain headers sent with every request
  fetchOptions: {headers: {'Accept-Language': 'en'}},
});

// the HeadersSubset travels as HTTP headers, not in the body
middlewares.auth.onRequest((auth) =>
  auth(new HeadersSubset({Authorization: 'Bearer my-token'}))
);

await routes.getDownloadUrl('report-42').call();
