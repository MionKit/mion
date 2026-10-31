import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

type User = {name: string; surname: string};

const routes = {
  // x-served-by is sent, but a browser on another origin cannot read it
  rateLimit: mion.middleware(
    (
      ctx
    ): HeadersSubset<
      'x-ratelimit-remaining',
      'x-served-by',
      {cors: {'x-served-by': false}}
    > =>
      new HeadersSubset({'x-ratelimit-remaining': '99', 'x-served-by': 'eu-1'})
  ),
  // cors: false takes every name of the subset off CORS
  trace: mion.headersMiddleware(
    (ctx, {headers}: HeadersSubset<never, 'x-trace-id', {cors: false}>): void =>
      undefined
  ),
  listUsers: mion.query((ctx): User[] => [{name: 'John', surname: 'Doe'}]),
} satisfies Routes;
