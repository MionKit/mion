# @mionjs/run-types

**Compile-time runtime types for TypeScript 7 / typescript-go (tsgo).**

TypeScript throws your types away before your code ever runs. RunTypes reads them
first, at build time, and hands the runtime back what it lost: validators, JSON and
binary (de)serializers, mock data, and reflection.

This is the runtime package: the sentinel markers the compiler looks for, plus the
small helper runtime the generated code calls into. It has **zero dependencies**.
The build-time half lives in
[`mion run-types/devtools`](https://www.npmjs.com/package/mion run-types/devtools).

## Documentation

Install, guides, the factory reference, and benchmarks live at
**[runtypes.pages.dev](https://runtypes.pages.dev/)**.

- [Quick start](https://runtypes.pages.dev/introduction/quick-start)
- [Configuration](https://runtypes.pages.dev/introduction/configuration)
- [Source and issues](https://github.com/MionKit/ts-run-types)

## Status

Experimental.

## License

MIT. See
[LICENSE](https://github.com/MionKit/ts-run-types/blob/main/LICENSE).
