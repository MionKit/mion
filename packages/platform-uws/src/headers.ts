/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import type {HttpRequest} from '@mionjs/bin-uws';

/** uWS headers are readable only synchronously inside the handler, so snapshot them; uWS already lower-cases the names. */
export function headersFromUwsRequest(req: HttpRequest): MionHeaders {
  const record: Record<string, string> = {};
  req.forEach((name, value) => {
    // a string check, not undefined: a `constructor` header would otherwise find Object.prototype's function
    const previous = record[name];
    record[name] = typeof previous === 'string' ? `${previous}, ${value}` : value;
  });
  return headersFromRecord(record, true);
}
