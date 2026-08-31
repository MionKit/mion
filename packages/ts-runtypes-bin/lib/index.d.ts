// Returns the absolute path to the mion resolver binary for the host
// platform. The `RT_BIN` environment variable overrides the lookup (it must
// name an executable file, or the call throws); otherwise this resolves the
// matching `@ts-runtypes/binary-<os>-<arch>` optional dependency (or the
// locally built `bin/ts-runtypes` inside this repo).
// Throws when no compatible binary is installed.
export declare function getExePath(): string;
