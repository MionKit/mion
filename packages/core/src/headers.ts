/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type DataOnly} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';

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
// Registered alongside the class so decoders rebuild a real instance: dispatch tests `instanceof HeadersSubset`.
// `deserialize` is required because the constructor takes the headers map, so the zero-arg default raises CLS002.
// ⚠️ The registry is keyed by class NAME, so ONE registration covers EVERY generic instantiation.
registerClassSerializer<HeadersSubset<string, string>>(HeadersSubset, {
  deserialize: (data: DataOnly<HeadersSubset<string, string>>) => new HeadersSubset(data.headers),
});
