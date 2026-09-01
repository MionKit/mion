// Root entry for @mionjs/devtools — the framework-agnostic unplugin
// instance (default export) plus the shared option types, the diagnostic
// formatter, and the wire constants. Bundler-specific entry points live at
// @mionjs/devtools/runtypes/vite, /rollup, /webpack, /rspack and /esbuild; the
// future lint integration at @mionjs/devtools/eslint.
export * from './core/unplugin.ts';
export {default} from './core/unplugin.ts';
