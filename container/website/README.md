# Docs websites (one install, two sites)

One Nuxt 4 + Docus v5 install that builds TWO sites: [runtypes.pages.dev](https://runtypes.pages.dev/)
and [mion.pages.dev](https://mion.pages.dev/), picked by `--site runtypes|mion` (the
default is runtypes; `build`, `container-build` and `check` also take `--site both`).
It runs only inside its podman container — drive it from the repo root:

```bash
pnpm miondevx website dev [--agent] [--site mion]      # hot-reload server (:3000, or :3100 with --agent)
pnpm miondevx website build [--no-bench] [--parallel]  # build both sites (with benchmarks); --parallel overlaps the two
pnpm miondevx website preview [--no-build]             # serve the static site locally
pnpm miondevx website check [--docs] --site both       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm miondevx website shell                            # debug shell inside the container
```

- [CONTAINER.md](CONTAINER.md) — the image, its layout, and the full command reference.
- [CLAUDE.md](CLAUDE.md) — stack, content tree, MDC components, `<code-import>` and twoslash usage.
- [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md) — the generated benchmark data the docs read.
