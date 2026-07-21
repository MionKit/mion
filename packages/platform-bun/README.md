<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>Full Stack APIs at the speed of light 🚀
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionjs/platform-bun`

> ⚠️ **Temporarily unsupported since the ts-runtypes migration.** The deepkit loader is gone —
> `loader/runtypes-loader.ts` now wraps the ts-runtypes resolver (`@ts-runtypes/devtools`'s Bun
> plugin, the counterpart of `mionVitePlugin`) — but the transparent `bun test`/`bun run` preload
> lane does not yet inject types for cross-package internal routes, so route registration still
> throws `MissingRtFnsError`. The precise blocker and the remaining paths (upstream Bun.plugin
> adapter, or a `Bun.build`/`ts-runtypes --compile` ahead-of-time lane) are tracked in
> [`docs/todos/platform-bun-runtypes-lane.md`](../../docs/todos/platform-bun-runtypes-lane.md).
> Do not publish this package until that lands.

This package contains a Bun server to run mion APIs!

## Check Out The [Website And Documentation](http://mion.io) 📚

[![mion-website-banner](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/mion-website-banner.png)](http://mion.io)

---

_[MIT](../../LICENSE) LICENSE_
