// The version stamp every mion binary build carries, dev (core/build.mjs) and release (release/build-binaries.mjs)
// alike. constants.Version folds into every typeID, so two builders that disagree here hash every type differently.
// Zero-dep, so a repo that builds on mion copies it verbatim and passes its mion checkout's root.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const CONSTANTS_PKG = 'github.com/mionkit/mion/ts-go-runtypes/pkg/constants';

// The lockstep mion version.
export function mionVersion(mionRoot) {
  const {version} = JSON.parse(readFileSync(join(mionRoot, 'version.json'), 'utf8'));
  if (typeof version !== 'string' || version === '') throw new Error(`${join(mionRoot, 'version.json')} names no version`);
  return version;
}

// The tsgo revision is metadata only (surfaced by --version), never a typeID input.
export function versionLdflags(version, tsgo) {
  return [`-X ${CONSTANTS_PKG}.Version=${version}`, `-X ${CONSTANTS_PKG}.TsgoVersion=${tsgo}`];
}
