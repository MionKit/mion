import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // sets the header on the response of every route after it
  noCache: mion.middleware(
    (ctx): HeadersSubset<'Cache-Control'> =>
      new HeadersSubset({'Cache-Control': 'no-store'})
  ),
  // reads a request header and answers with a response header
  locale: mion.headersFn(
    (
      ctx,
      {headers}: HeadersSubset<never, 'Accept-Language'>
    ): HeadersSubset<'Content-Language'> =>
      new HeadersSubset({
        'Content-Language': headers['Accept-Language'] ?? 'en',
      })
  ),
} satisfies Routes;
