import {configureBinary} from '@mionjs/core';
import {startNodeServer} from '@mionjs/platform-node';

// start-configure
configureBinary({
  // where the bytes live
  pool: {
    enabled: true, // armed by the node/bun adapters; other platforms have no safe release point
    minClassBytes: 1024, // smallest size class
    maxClassBytes: 1024 * 1024, // above this, buffers are served but never retained
    maxPerClass: 32, // free-list depth per class
    maxTotalBytes: 64 * 1024 * 1024, // ceiling on everything held
  },
  // how big a buffer to ask for
  sizeStats: {
    ringSize: 64, // recent sizes remembered per route
    maxKeys: 500, // tracked-route cap
  },
  // inherited from @mionjs/run-types: the encoded-string cache
  maxStrCacheLength: 64,
  maxCacheSize: 1000,
});
// end-configure

// start-server-option
await startNodeServer({port: 8080, binary: {pool: {enabled: false}}});
// end-server-option
