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

## CLI

```sh
npx ts-runtypes-bin --version
```

Execs the resolved binary with the given arguments (forwarding stdio and exit
code).

## Documentation

Full guides live at **[runtypes.pages.dev](https://runtypes.pages.dev/)**.
[Source and issues](https://github.com/MionKit/ts-run-types).
