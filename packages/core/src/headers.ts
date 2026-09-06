/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerClassSerializer, type DataOnly} from '@mionjs/run-types';

// type-headers-subset-start
/** Type-safe wrapper for HTTP headers */
export class HeadersSubset<Required extends string, Optional extends string = never> {
  readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
  constructor(headers: {[K in Required]: string} & {[K in Optional]?: string}) {
    this.headers = headers;
  }
}
// type-headers-subset-end

// ############# HeadersSubset -> mion class serializer #############
// Registered here, alongside the class, so JSON/binary decoders rebuild a real instance
// (`instanceof HeadersSubset` holds after a round trip — the router's dispatch relies on
// that check). The constructor takes the headers map, so `deserialize` is required: the
// automatic zero-arg `new HeadersSubset()` is unavailable and would surface CLS002.
//
// ⚠️ mion keys the registry by the class-NAME lane, so ONE registration covers EVERY
// generic instantiation the program uses, not just the <string, string> projection.
registerClassSerializer<HeadersSubset<string, string>>(HeadersSubset, {
  deserialize: (data: DataOnly<HeadersSubset<string, string>>) => new HeadersSubset(data.headers),
});
