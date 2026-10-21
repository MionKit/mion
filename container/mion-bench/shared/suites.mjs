/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What each benchmark measures, and how a request for it is built. One entry per
// page on the docs site, plus the payload-size sweep.
//
// `build(size)` returns the value a request carries; `bodyFor` writes it in each app's wire shape.

import {buildSimpleUser, buildUser, buildUserOfSize, mionBody, plainBody, SWEEP_SIZES} from './payloads.mjs';

/** `codec` (apps/mion/compact-wire.ts) is passed in because this tree imports nothing third-party. */
export function bodyFor(app, value, codec) {
  if (app.family !== 'mion') return plainBody(value);
  return codec ? codec.encodeParams([value]) : mionBody(value);
}

export const SUITES = {
  'hello-world': {
    label: 'Hello World',
    // Routing and framework overhead only: no body to parse, nothing to validate.
    // The theoretical ceiling for each framework.
    description: 'Routing only, no validation.',
    method: 'GET',
    path: '/hello',
    build: () => undefined,
  },
  'light-validation': {
    label: 'Light Validation',
    description: 'A ~100 byte user: four fields, one of them a date.',
    method: 'POST',
    path: '/updateSimpleUser',
    build: () => buildSimpleUser(),
  },
  'heavy-validation': {
    label: 'Heavy Validation',
    description: 'A ~1 KB user: nested objects, a discriminated union and three dates.',
    method: 'POST',
    path: '/updateUser',
    build: () => buildUser(),
  },
};

// The sweep is a separate lane: the same heavy-validation route across the four sizes
// in payloads.mjs, on every app. The sizes straddle 512 KiB on purpose, the point where
// a body stops arriving in one socket read and @mionjs/platform-uws takes its zero-copy
// path.
export const SWEEP_SUITE = {
  label: 'Payload Sizes',
  description: 'The same heavy-validation route across four payload sizes.',
  method: 'POST',
  path: '/updateUser',
  sizes: SWEEP_SIZES,
  build: (size) => buildUserOfSize(size.bytes),
};

export const SUITE_KEYS = Object.keys(SUITES);
