// binary-platforms.mjs — the ONE list of platforms each per-platform payload
// family is published for, shared by the staging builds (build-binaries.mjs,
// build-uws-binaries.mjs), the uws fetch (fetch-uws.mjs) and the publish guard
// (publish-tarballs.mjs) so none of them can disagree about what "all of them"
// means.
//
// Two families, two lists: the mion resolver (@mionjs/native-compiler-<os>-<cpu>, seven
// platforms, cross-compiled from Go) and the uWebSockets.js mirror
// (@mionjs/native-uws-<os>-<cpu>, the five platforms upstream ships binaries for).
//
// node os / cpu (the package.json os/cpu fields and process.platform/arch keys)
// → Go GOOS / GOARCH. Keep in lockstep with getExePath()'s platform key in
// packages/bin-compiler/lib/index.js.
//
// Zero-dep on purpose: publish.yml runs the release scripts pnpm-free.

export const PLATFORMS = [
  {os: 'linux', cpu: 'x64', goos: 'linux', goarch: 'amd64'},
  {os: 'linux', cpu: 'arm64', goos: 'linux', goarch: 'arm64'},
  {os: 'linux', cpu: 'arm', goos: 'linux', goarch: 'arm', goarm: '6'},
  {os: 'darwin', cpu: 'x64', goos: 'darwin', goarch: 'amd64'},
  {os: 'darwin', cpu: 'arm64', goos: 'darwin', goarch: 'arm64'},
  {os: 'win32', cpu: 'x64', goos: 'windows', goarch: 'amd64'},
  {os: 'win32', cpu: 'arm64', goos: 'windows', goarch: 'arm64'},
];

// Keep in lockstep with SUPPORTED_PLATFORMS in packages/bin-uws/lib/index.js.
export const UWS_PLATFORMS = [
  {os: 'linux', cpu: 'x64'},
  {os: 'linux', cpu: 'arm64'},
  {os: 'darwin', cpu: 'x64'},
  {os: 'darwin', cpu: 'arm64'},
  {os: 'win32', cpu: 'x64'},
];

export const platformKey = (platform) => `${platform.os}-${platform.cpu}`;
export const platformPackageName = (platform) => `@mionjs/native-compiler-${platformKey(platform)}`;
export const uwsPackageName = (platform) => `@mionjs/native-uws-${platformKey(platform)}`;

// The platform this process runs on, as one entry of `platforms`. Throws when the
// host is not a publish platform: a host-only build there would stage nothing
// usable.
function hostOf(platforms, family, {os = process.platform, cpu = process.arch} = {}) {
  const host = platforms.find((platform) => platform.os === os && platform.cpu === cpu);
  if (!host) {
    throw new Error(`${os}-${cpu} is not a ${family} publish platform (one of ${platforms.map(platformKey).join(', ')}), so --host-only cannot build for it.`);
  }
  return host;
}
export const hostPlatform = (host) => hostOf(PLATFORMS, 'resolver', host);
export const hostUwsPlatform = (host) => hostOf(UWS_PLATFORMS, 'uws', host);

// The platforms a build stages: all of them, or just the host's with --host-only.
// The host-only form exists for the lanes that install the packed tarballs on the
// very machine (or a container of the same platform) that built them — the
// drizzle-e2e workflow — where every other platform is minutes of wasted runner
// (six Go cross-builds, twelve uws downloads). A release always builds all of
// them (publish-tarballs.mjs refuses otherwise).
export function selectPlatforms({hostOnly = false, os, cpu} = {}) {
  return hostOnly ? [hostPlatform({os, cpu})] : PLATFORMS;
}
export function selectUwsPlatforms({hostOnly = false, os, cpu} = {}) {
  return hostOnly ? [hostUwsPlatform({os, cpu})] : UWS_PLATFORMS;
}

// The publish platforms of BOTH families that have NO tarball in `tarballs`
// (basenames), as `native-compiler-<key>` / `native-uws-<key>`. A non-empty answer means the set
// was packed from a host-only staging.
export function missingPlatformTarballs(tarballs) {
  const missing = (family, platforms) =>
    platforms.filter((platform) => !tarballs.some((file) => file.startsWith(`mionjs-${family}-${platformKey(platform)}-`))).map((platform) => `${family}-${platformKey(platform)}`);
  return [...missing('native-compiler', PLATFORMS), ...missing('native-uws', UWS_PLATFORMS)];
}
