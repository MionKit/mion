// Root entry for @ts-runtypes/devtools — the framework-agnostic unplugin
// instance (default export) plus the shared option types, the diagnostic
// formatter, and the wire constants. Bundler-specific entry points live at
// @ts-runtypes/devtools/vite, /rollup, /webpack, /rspack and /esbuild; the
// future lint integration at @ts-runtypes/devtools/eslint.
export * from './unplugin.ts';
export {default} from './unplugin.ts';
