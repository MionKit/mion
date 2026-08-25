/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What each benchmark measures, and how a request for it is built. One entry per
// page on the docs site, plus the payload-size sweep.
//
// `body(app)` gets the app descriptor so mion can be handed its own wire shape (a
// bare array of route arguments) while every other framework gets the plain object.

import {buildSimpleUser, buildUser, buildUserOfSize, mionBody, plainBody, SWEEP_SIZES} from './payloads.mjs';

const bodyFor = (app, value) => (app.family === 'mion' ? mionBody(value) : plainBody(value));

export const SUITES = {
  'hello-world': {
    label: 'Hello World',
    // Routing and framework overhead only: no body to parse, nothing to validate.
    // The theoretical ceiling for each framework.
    description: 'Routing only, no validation.',
    method: 'GET',
    path: '/hello',
    body: () => undefined,
  },
  'light-validation': {
    label: 'Light Validation',
    description: 'A ~100 byte user: four fields, one of them a date.',
    method: 'POST',
    path: '/updateSimpleUser',
    body: (app) => bodyFor(app, buildSimpleUser()),
  },
  'heavy-validation': {
    label: 'Heavy Validation',
    description: 'A ~1 KB user: nested objects, a discriminated union and three dates.',
    method: 'POST',
    path: '/updateUser',
    body: (app) => bodyFor(app, buildUser()),
  },
};

// The sweep is a separate lane: it runs the mion adapters ONLY (the question it
// answers is how mion's own body handling scales, notably the uws zero-copy path
// above 512 KiB), across the four sizes in payloads.mjs.
export const SWEEP_SUITE = {
  label: 'Payload Sizes',
  description: 'The same heavy-validation route across four payload sizes.',
  method: 'POST',
  path: '/updateUser',
  sizes: SWEEP_SIZES,
  body: (app, size) => bodyFor(app, buildUserOfSize(size.bytes)),
};

export const SUITE_KEYS = Object.keys(SUITES);
