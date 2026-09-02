# @mionjs/run-types

**Compile-time runtime types for TypeScript 7 / typescript-go (tsgo).**

TypeScript throws your types away before your code ever runs. RunTypes reads them
first, at build time, and hands the runtime back what it lost: validators, JSON and
binary (de)serializers, mock data, and reflection.

This is the runtime package: the sentinel markers the compiler looks for, plus the
small helper runtime the generated code calls into. It has **zero dependencies**.
The build-time half lives in
[`@mionjs/devtools`](https://www.npmjs.com/package/@mionjs/devtools).

## Documentation

Install, guides, the factory reference, and benchmarks live at
**[mion.pages.dev/runtypes](https://mion.pages.dev/runtypes)**.

- [Quick start](https://mion.pages.dev/runtypes/introduction/quick-start)
- [Configuration](https://mion.pages.dev/runtypes/introduction/configuration)
- [Source and issues](https://github.com/MionKit/mion)

## Status

Experimental.

## License

MIT. See
[LICENSE](https://github.com/MionKit/mion/blob/main/LICENSE).
