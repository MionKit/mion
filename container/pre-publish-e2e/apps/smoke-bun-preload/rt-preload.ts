// The --preload module: registers the RunTypes plugin on Bun's RUNTIME loader
// (Bun.plugin), which transforms each file as bun imports it.
//
// DELIBERATELY NOT AWAITED. Bun.plugin() returns a promise for an async setup
// but does not wait for it before importing modules, so an un-awaited
// registration races the resolver's startup. @mionjs/devtools/runtypes/bun is
// supposed to make that safe on its own (it gates every load on an internal
// readiness promise); writing `await` here would hide a regression in exactly
// the thing this app is here to prove.
import {plugin} from 'bun';
import runtypes from '@mionjs/devtools/runtypes/bun';

plugin(
  runtypes({
    ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
    cwd: import.meta.dir,
    tsconfig: 'tsconfig.json',
    genDir: `${import.meta.dir}/.rt`,
  }) as never
);
