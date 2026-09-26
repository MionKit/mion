/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient as initPlainClient} from '../../src/client.ts';
import {useMethodsMetadata} from '../../src/middlewares/methodsMetadata.ts';

/** The fetched-lane specs' client: sets up metadata fetching, as an app with `bundleApi: false` does. */
export const initClient: typeof initPlainClient = (options, buildVersion) => {
  const client = initPlainClient(options, buildVersion);
  useMethodsMetadata((client.middlewares as any).mionMethodsMetadata);
  return client;
};
