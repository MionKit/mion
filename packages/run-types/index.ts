/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/run-types is now a thin proxy over @ts-runtypes/core (the published,
// fully precompiled successor of the old in-repo runtime type system).
// Everything type-related is resolved AT BUILD TIME by the @ts-runtypes/devtools
// vite plugin (wrapped by @mionjs/devtools mionVitePlugin): call sites of
// functions with trailing injection-marker params get precompiled function
// tuples injected; there is no runtime reflection and no JIT compilation left.
//
// See migration-docs/ at the repo root for the full migration story.

export * from '@ts-runtypes/core';

// mion-specific adapter: turns injected marker payloads into the
// JitCompiledFunctions / reflection shapes the router consumes.
export * from './src/mionAdapter.ts';
