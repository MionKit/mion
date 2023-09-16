<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>mion http server for bun.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionkit/bun`

- Loader for support for @deepkit/type-compiler in bum
- mion's http server for bun

## runtime types WIP

- Loader for @deepkit/type-compiler in `src/ryntypes-loader`
- requires setting the loader in `bunfig.toml` (both for run and test files)
- the preload config seems to only accept relative paths
- no option to pass tsConfig path
- there is no way to pas source Maps from ts transpilation, Maybe inlined source Maps?
- the test files are themselves are not transformed using the Loader so any code that emits type metadata must be outside the test file

## Check Out The [Website And Documentation](http://mion.io) 📚

[![mion-website-banner](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/mion-website-banner.png)](http://mion.io)

---

[MIT LICENSE](../../LICENSE)
