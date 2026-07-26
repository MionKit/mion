# @ts-runtypes/bin

Platform launcher for the RunTypes resolver binary.

This package ships **zero runtime dependencies**. The actual native binary is
delivered as a per-platform **optional dependency** named
`@ts-runtypes/binary-<os>-<arch>` (e.g. `@ts-runtypes/binary-linux-x64`). Each of
those declares `os` + `cpu`, so your package manager installs only the one
matching your machine and silently skips the rest.

You normally never install this directly — `@ts-runtypes/devtools` depends on it
and calls `getExePath()` to locate the binary.

## API

```js
import {getExePath} from '@ts-runtypes/bin';

const exe = getExePath(); // absolute path to the resolver binary for this host
```

`getExePath()` throws a descriptive error if no compatible
`@ts-runtypes/binary-*` package is installed (unsupported platform, or the
optional dependency was skipped).

## `RT_BIN` — pointing at a specific binary

Set `RT_BIN` to an absolute (or cwd-relative) path and `getExePath()` returns it
instead of resolving the platform package:

```sh
RT_BIN=/path/to/ts-runtypes pnpm run lint
```

It applies to every consumer of the launcher, so both the bundler plugins and
the lint plugin use the same build. The bundler plugins' explicit `binary`
option still wins over it. The value must name an **executable file**: a
missing, non-file, or non-executable path throws, so a typo can never fall
through to a different binary.

Use it to validate an unpublished build in a real consumer, bisect a resolver
regression without editing `node_modules`, or run a binary that arrived
out-of-band in an air-gapped install.

> **Version warning:** the resolver's version is folded into every type id, so
> an override pointing at a different-version build produces cache entries that
> diverge from a normal install. Clear `node_modules/.cache/ts-runtypes` when
> switching back.

## CLI

```sh
npx ts-runtypes-bin --version
```

Execs the resolved binary with the given arguments (forwarding stdio and exit
code).

## Documentation

Full guides live at **[runtypes.pages.dev](https://runtypes.pages.dev/)**.
[Source and issues](https://github.com/MionKit/ts-run-types).
