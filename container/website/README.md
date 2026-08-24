# RunTypes docs website

Nuxt 4 + Docus v5 site behind [runtypes.pages.dev](https://runtypes.pages.dev/).
It runs only inside its podman container — drive it from the repo root:

```bash
pnpm rtx website dev [--agent]        # hot-reload server (:3000, or :3100 with --agent)
pnpm rtx website build [--no-bench]   # build the docs site (with benchmarks)
pnpm rtx website preview [--no-build] # serve the static site locally
pnpm rtx website check [--docs]       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm rtx website shell                # debug shell inside the container
```

- [CONTAINER.md](CONTAINER.md) — the image, its layout, and the full command reference.
- [CLAUDE.md](CLAUDE.md) — stack, content tree, MDC components, `<code-import>` and twoslash usage.
- [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md) — the generated benchmark data the docs read.
