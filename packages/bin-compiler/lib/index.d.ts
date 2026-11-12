// Absolute path to the mion resolver binary for the host platform; throws when no compatible binary is installed.
// Order: `MION_BIN` (must name an executable file, or throws); then an installed `@mionkit/pro-bin-compiler`
// launcher, from the working directory then this package (its `mionVersion` must equal this package's, or throws);
// then the `@mionjs/native-compiler-<os>-<arch>` optional dependency (or this repo's built `mion-bin/mion`).
export declare function getExePath(): string;

// True when getExePath's lookup finds a `@mionkit/pro-bin-compiler` launcher, so a caller can skip extension-only work.
export declare function hasProLauncher(): boolean;
