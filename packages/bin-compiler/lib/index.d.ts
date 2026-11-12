// Returns the absolute path to the mion resolver binary for the host
// platform. Order: the `MION_BIN` environment variable (it must name an
// executable file, or the call throws); then an installed
// `@mionkit/pro-bin-compiler` launcher, found from the working directory and
// then from this package (its `mionVersion` must equal this package's version,
// or the call throws); then the matching `@mionjs/native-compiler-<os>-<arch>`
// optional dependency (or the locally built `mion-bin/mion` inside this repo).
// Throws when no compatible binary is installed.
export declare function getExePath(): string;

// True when an `@mionkit/pro-bin-compiler` launcher is installed for this
// project (the lookup getExePath uses), so a caller can skip extension-only work.
export declare function hasProLauncher(): boolean;
