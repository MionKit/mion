# @mionjs/devtools

Build-time tooling for **RunTypes**. It carries two surfaces: a cross-bundler
plugin that rewrites RunTypes marker calls (`getRunTypeId`, `createValidateFn`,
`createJsonEncoderFn`, …) into specialized, type-derived code, and a lint plugin
(OXlint and ESLint v9) that surfaces the compiler's diagnostics in your editor and
CI.

The runtime half is
[`@mionjs/run-types`](https://www.npmjs.com/package/@mionjs/run-types); the compiler
binary rides along in [`@mionjs/bin-compiler`](https://www.npmjs.com/package/@mionjs/bin-compiler).

Entry points: `/vite`, `/rollup`, `/rolldown`, `/webpack`, `/rspack`, `/esbuild`,
`/unplugin` for any other tool, `/oxlint` and `/eslint` for linting, and the package
root for the shared types and helpers.

## Documentation

Install, wiring, the full option list, and the linting setup live at
**[mion.pages.dev/runtypes](https://mion.pages.dev/runtypes)**.

- [Quick start](https://mion.pages.dev/runtypes/introduction/quick-start)
- [Configuration](https://mion.pages.dev/runtypes/introduction/configuration)
- [Linting](https://mion.pages.dev/runtypes/guide/linting)
- [Source and issues](https://github.com/MionKit/mion)

## Status

Experimental.

## License

MIT. See
[LICENSE](https://github.com/MionKit/mion/blob/main/LICENSE).
