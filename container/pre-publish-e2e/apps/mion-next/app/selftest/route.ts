// The round trip, driven from INSIDE the app so its `batch()` call site is part of the same
// program the API is built from. That is the whole point: the build reads this batch, gives it
// an id, and compiles it into the route handler next door, so the two cannot disagree.
//
// build-all.mjs starts the built app and fetches this route; test/build-outputs.test.mjs asserts
// what it reported.
import {batch, initClient} from '@mionjs/client';
import type {MionApi} from '../../src/routes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // The ORIGIN, not `/api`: the router's basePath already puts `/api` in every route path.
  const baseURL = new URL('/', request.url).origin;
  // basePath on BOTH ends: the router puts `/api` into every route path, and the client has to
  // build the same path or its very first call (the route metadata fetch) lands outside the
  // catch-all handler and comes back as Next's 404 page.
  const {routes} = initClient<MionApi>({baseURL, basePath: '/api'});

  const [greeting, greetingError] = await routes.sayHello('mion').call();
  // Compact wire: the same client, a route whose encoder is positional.
  const [sum, sumError] = await routes.addNumbers(40, 2).call();
  // Batch: one request carrying both, run by the id this build baked into the server.
  const [[batched, batchedSum], [batchedError, batchedSumError], batchFatal] = await batch([
    routes.sayHello('batch'),
    routes.addNumbers(1, 2),
  ]).call();

  return Response.json({
    json: {message: greeting?.message, atIsDate: greeting?.at instanceof Date, error: String(greetingError ?? '')},
    compact: {sum, error: String(sumError ?? '')},
    batch: {
      message: batched?.message,
      sum: batchedSum,
      error: String(batchedError ?? batchedSumError ?? batchFatal ?? ''),
    },
  });
}
