// binary-platforms.mjs — the ONE list of platforms the mion resolver binary is
// published for, shared by the staging build (build-binaries.mjs) and the publish
// guard (publish-tarballs.mjs) so the two can never disagree about what "all of
// them" means.
//
// node os / cpu (the package.json os/cpu fields and process.platform/arch keys)
// → Go GOOS / GOARCH. Keep in lockstep with getExePath()'s platform key in
// packages/bin/lib/index.js.
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

export const platformKey = (platform) => `${platform.os}-${platform.cpu}`;
export const platformPackageName = (platform) => `@mionjs/binary-${platformKey(platform)}`;

// The platform this process runs on, as one of PLATFORMS. Throws when the host is
// not a publish platform: a host-only build there would stage nothing usable.
export function hostPlatform({os = process.platform, cpu = process.arch} = {}) {
  const host = PLATFORMS.find((platform) => platform.os === os && platform.cpu === cpu);
  if (!host) {
    throw new Error(`${os}-${cpu} is not a publish platform (one of ${PLATFORMS.map(platformKey).join(', ')}), so --host-only cannot build for it.`);
  }
  return host;
}

// The platforms a build stages: all of them, or just the host's with --host-only.
// The host-only form exists for the lanes that install the packed tarballs on the
// very machine (or a container of the same platform) that built them — the
// drizzle-e2e workflow — where the six cross-builds are minutes of wasted runner.
// A release always builds all of them (publish-tarballs.mjs refuses otherwise).
export function selectPlatforms({hostOnly = false, os, cpu} = {}) {
  return hostOnly ? [hostPlatform({os, cpu})] : PLATFORMS;
}

// The publish platforms that have NO tarball in `tarballs` (basenames). A
// non-empty answer means the set was packed from a host-only staging.
export function missingPlatformTarballs(tarballs) {
  return PLATFORMS.filter((platform) => !tarballs.some((file) => file.startsWith(`mionjs-binary-${platformKey(platform)}-`))).map(platformKey);
}
