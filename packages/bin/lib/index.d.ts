// Returns the absolute path to the mion resolver binary for the host
// platform. The `MION_BIN` environment variable overrides the lookup (it must
// name an executable file, or the call throws); otherwise this resolves the
// matching `@mionjs/binary-<os>-<arch>` optional dependency (or the
// locally built `bin/mion` inside this repo).
// Throws when no compatible binary is installed.
export declare function getExePath(): string;
