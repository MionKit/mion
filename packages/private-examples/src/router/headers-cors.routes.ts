import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // x-debug-node is sent, but a browser on another origin cannot read it
  listUsers: mion.query(
    (
      ctx
    ): HeadersSubset<
      'x-total',
      'x-debug-node',
      {cors: {'x-debug-node': false}}
    > => new HeadersSubset({'x-total': '2', 'x-debug-node': 'eu-1'})
  ),
  // cors: false takes every name of the subset off CORS
  trace: mion.headersMiddleware(
    (ctx, {headers}: HeadersSubset<never, 'x-trace-id', {cors: false}>): void =>
      undefined
  ),
} satisfies Routes;
