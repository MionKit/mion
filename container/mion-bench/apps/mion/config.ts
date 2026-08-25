/* ########
 * 2026 mion · License: MIT
 * ######## */

export const BENCH_PORT = Number(process.env.MION_BENCH_PORT || 3000);

// The platform adapters default to 256 KB, which is BELOW uws' 512 KiB single-read
// threshold - so with the default the payload sweep could never reach the zero-copy
// branch it exists to exercise; every large request would come back
// 'request-payload-too-large' instead. 10 MB clears the sweep's 4 MB body.
export const MAX_BODY_SIZE = 10 * 1024 * 1024;
