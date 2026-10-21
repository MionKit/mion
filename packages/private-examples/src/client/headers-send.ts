import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {HeadersApi} from '../router/headers-api.routes.ts';

const {routes, middlewares} = initClient<HeadersApi>({
  baseURL: 'http://localhost:3000',
  fetchOptions: {headers: {'Accept-Language': 'en'}},
});

// the HeadersSubset is sent as HTTP headers, not in the body
middlewares.trace.onRequest((trace) =>
  trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
);

await routes.getDownloadUrl('report-42').call();
