// The version stamp every mion binary build carries, dev (core/build.mjs) and release (release/build-binaries.mjs)
// alike. constants.Version folds into every typeID, so two builders that disagree here hash every type differently.
// Zero-dep, so a repo that builds on mion copies it verbatim and passes its mion checkout's root.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const CONSTANTS_PKG = 'github.com/mionkit/mion/ts-go-runtypes/pkg/constants';

// The lockstep mion version (<mionRoot>/version.json); throws when the file is missing or names none.
export function mionVersion(mionRoot) {
  const {version} = JSON.parse(readFileSync(join(mionRoot, 'version.json'), 'utf8'));
  if (typeof version !== 'string' || version === '') throw new Error(`${join(mionRoot, 'version.json')} names no version`);
  return version;
}

// The two `-X` flags stamping the mion version and the pinned tsgo revision (metadata only, never a typeID input).
export function versionLdflags(version, tsgo) {
  return [`-X ${CONSTANTS_PKG}.Version=${version}`, `-X ${CONSTANTS_PKG}.TsgoVersion=${tsgo}`];
}
