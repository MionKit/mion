# @mionjs/bin-compiler

Platform launcher for the **RunTypes** compiler binary.

You normally never install this directly:
[`@mionjs/devtools`](https://www.npmjs.com/package/@mionjs/devtools)
depends on it and uses it to locate the binary for the host it is running on. The
binary itself rides as a per-platform optional dependency named
`@mionjs/native-compiler-<os>-<arch>`, so your package manager downloads only the one
your machine needs. This package ships **zero runtime dependencies**.

The binary it picks, first match wins:

1. The `MION_BIN` environment variable (must name an executable file).
2. An installed `@mionkit/pro-bin-compiler` launcher. Its mion version must equal
   this package's version, or the lookup throws.
3. The platform package.

## Documentation

Install, guides, and the factory reference live at
**[mion.io/runtypes](https://mion.io/runtypes)**.

- [Quick start](https://mion.io/runtypes/introduction/quick-start)
- [Built on typescript-go](https://mion.io/runtypes/introduction/built-on-typescript-go)
- [Source and issues](https://github.com/MionKit/mion)

## Status

Experimental.

## License

MIT. See
[LICENSE](https://github.com/MionKit/mion/blob/main/LICENSE).
