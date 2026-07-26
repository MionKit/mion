# @ts-runtypes/bin

Platform launcher for the **RunTypes** compiler binary.

You normally never install this directly:
[`@ts-runtypes/devtools`](https://www.npmjs.com/package/@ts-runtypes/devtools)
depends on it and uses it to locate the binary for the host it is running on. The
binary itself rides as a per-platform optional dependency named
`@ts-runtypes/binary-<os>-<arch>`, so your package manager downloads only the one
your machine needs. This package ships **zero runtime dependencies**.

## Documentation

Install, guides, and the factory reference live at
**[runtypes.pages.dev](https://runtypes.pages.dev/)**.

- [Quick start](https://runtypes.pages.dev/introduction/quick-start)
- [Built on typescript-go](https://runtypes.pages.dev/introduction/built-on-typescript-go)
- [Source and issues](https://github.com/MionKit/ts-run-types)

## Status

Experimental.

## License

Proprietary — all rights reserved. No use, copying, or distribution without prior
written authorization. See
[LICENSE](https://github.com/MionKit/ts-run-types/blob/main/LICENSE).
