/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** @mionkit/devtools - Development tooling for mion */

// Main entry re-exports ESLint plugin as default
export {default} from './src/eslint/index.ts';

// Codegen (AOT) - source only, no build
export * from './src/codegen/types.ts';
export * from './src/codegen/constants.ts';
export * from './src/codegen/cacheCompiler.ts';
export * from './src/codegen/aot-compile.ts';
export * from './src/codegen/cli-build-aot.ts';
export * from './src/codegen/cli-init-aot.ts';
export * from './src/codegen/run-build-aot.ts';
export * from './src/codegen/run-init-aot.ts';

// ESLint Plugin - built separately
export {default as eslintPlugin} from './src/eslint/index.ts';

// Vite Plugin - built separately
export * from './src/vite-plugin/index.ts';
