/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compact body writers and readers for harness/run.mjs, compiled from the same types as routes-compact.ts:
// a hand-written positional body would be a second copy of the wire, free to drift.
import {createJsonEncoderFn, createRestoreFromJsonFn} from '@mionjs/run-types';
import {SimpleUser, User} from '../../shared/models.ts';

// payloads.mjs writes plain JSON (dates as text); the compact encoder needs the typed values a mion client holds.
const restoreUser = createRestoreFromJsonFn<[User]>();
const restoreSimpleUser = createRestoreFromJsonFn<[SimpleUser]>();
const encodeUser = createJsonEncoderFn<[User]>(undefined, {strategy: 'compact'});
const encodeSimpleUser = createJsonEncoderFn<[SimpleUser]>(undefined, {strategy: 'compact'});

/** Per route id: plain JSON params written as a compact body, and a compact response read back as keyed data. */
export const COMPACT_WIRE = {
  // a GET: no body to encode
  hello: {
    decodeReturn: createRestoreFromJsonFn<{hello: string}>(undefined, {strategy: 'compact'}),
  },
  updateUser: {
    encodeParams: (params: unknown[]) => encodeUser(restoreUser(params)),
    decodeReturn: createRestoreFromJsonFn<User>(undefined, {strategy: 'compact'}),
  },
  updateSimpleUser: {
    encodeParams: (params: unknown[]) => encodeSimpleUser(restoreSimpleUser(params)),
    decodeReturn: createRestoreFromJsonFn<SimpleUser>(undefined, {strategy: 'compact'}),
  },
};
