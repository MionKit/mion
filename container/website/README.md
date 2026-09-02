# Docs website (one site, three subsites)

One Nuxt 4 + Docus v5 install that builds ONE static site, [mion.pages.dev](https://mion.pages.dev/),
with a subsite per feature: `/rpc` (the framework), `/runtypes` and `/benchmarks`. Each
subsite has its own sidebar and colour scheme; the header switches between them.
It runs only inside its podman container, so drive it from the repo root:

```bash
pnpm miondevx website dev [--agent]        # hot-reload server (:3000, or :3100 with --agent)
pnpm miondevx website build [--no-bench]   # build the site (with benchmarks)
pnpm miondevx website preview [--no-build] # serve the static site locally
pnpm miondevx website check [--docs]       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm miondevx website check --static       # serve the BUILT site + assert it is not hollow
pnpm miondevx website shell                # debug shell inside the container
```

- [CONTAINER.md](CONTAINER.md) — the image, its layout, and the full command reference.
- [CLAUDE.md](CLAUDE.md) — stack, content tree, subsites, MDC components, `<code-import>` and twoslash usage.
- [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md) — the generated benchmark data the docs read.
