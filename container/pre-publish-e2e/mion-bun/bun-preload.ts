// Registers the RunTypes plugin on Bun's RUNTIME loader (Bun.plugin), which
// transforms each file as bun imports it — the Bun counterpart of mionVitePlugin.
//
// The published @mionjs/platform-bun deliberately ships NO loader: its repo-local
// loader/runtypes-loader.ts is absent from `files`, from `exports` and from the
// build entries, and it was only ever a thin wrapper over this same module. So a
// real bun consumer wires @mionjs/devtools/runtypes/bun themselves, which is what this
// does — pinning the contract that actually reaches consumers.
//
// Awaited, unlike the runtypes-side smoke-bun-preload app: that one deliberately
// leaves the await off to prove the plugin's internal readiness gate holds. Here the
// subject is mion on top of a plugin already proven safe, so the ordering is made
// obvious instead.
import {plugin} from 'bun';
import runtypes from '@mionjs/devtools/runtypes/bun';

await plugin(
  runtypes({
    ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
    cwd: import.meta.dir,
    tsconfig: 'tsconfig.json',
    genDir: `${import.meta.dir}/.rt`,
  }) as never
);
