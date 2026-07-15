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
// See docs/done/migration-overview.md for the full migration story.

export * from '@ts-runtypes/core';

// side effect: registers every ts-runtypes format (patterns, pure fns, mocking fns).
// Type-only imports of format aliases get erased by the transpiler, so registration
// must ride a module that is always value-imported — this one is.
import '@ts-runtypes/core/formats';

// mion-specific adapter: turns injected marker payloads into the
// JitCompiledFunctions / reflection shapes the router consumes.
export * from './src/mionAdapter.ts';

// mion pure functions: ts-runtypes pure-fn registry under the 'mionjs' namespace.
export * from './src/mionPureFns.ts';

// side effect: registers mion error classes (TypedError/RpcError) with the
// ts-runtypes class-serializer registry so decoders rebuild real instances.
import './src/mionClassSerializers.ts';
