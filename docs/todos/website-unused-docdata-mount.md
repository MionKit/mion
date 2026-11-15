---
type: chore
spec: guidelines
status: ready
created: 2026-11-14
---

# Website container: the `.docdata` mount has no reader

## Intent

`scripts/website/site.mjs` mounts `<repo>/.docdata` read-only at `/app/.docdata` and sets `MION_DOCDATA` in the
container. The only code that reads the variable is `DOCDATA_DIR` in
`container/website/site-layers/shell/server/utils/repo-root.ts`, and nothing imports `DOCDATA_DIR`. The site gets
its benchmark data another way: the build copies it into `public/bench-data` on the host.

So the mount, the in-container variable, the `MION_WEBSITE_DOCDATA` override and the lines that describe them look
like dead plumbing. For another repo's site the variable is also set while the folder is not mounted.

## Direction

- Confirm nothing inside the container reads `/app/.docdata` (site code, layer scripts, benchmark runs that share
  the image).
- If nothing does: remove `DOCDATA_DIR`, the mount, `MION_DOCDATA` and `MION_WEBSITE_DOCDATA` from `site.mjs`,
  the env registry (`scripts/lib/env.mjs`), `.env.sample`, `SETUP.md`, `container/website/CONTAINER.md` and
  `container/benchmarks/README.md`. A removed thing leaves no trace.
- If something does: give `DOCDATA_DIR` its reader back or drop only the dead export, and set the variable only
  when the folder is mounted.

## Done when

- Either every piece above is gone and the site build output is unchanged, or the reader is named in the code.
- `pnpm run lint` and the devtools tests pass.
