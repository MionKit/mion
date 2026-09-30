/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient as initPlainClient} from '../../src/client.ts';
import {useFetchMetadata} from '../../src/middlewares/fetchMetadata.ts';

/** The fetched-lane specs' client: sets up metadata fetching, as an app with `bundleApi: false` does. */
export const initClient: typeof initPlainClient = (options, buildVersion) => {
  const client = initPlainClient(options, buildVersion);
  useFetchMetadata((client.middlewares as any).mionFetchMetadata);
  return client;
};
