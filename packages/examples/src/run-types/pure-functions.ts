import {registerPureFn} from '@mionjs/run-types';

// Pure functions belong to mion run-types — mion registers none of its own. `registerPureFn` takes a
// LITERAL key and an INLINE function literal: the build scanner extracts the body and AOT-compiles
// it, so it has to see both at the call site.
registerPureFn('app::isNotEmpty', (value: string): boolean => value.length > 0);
