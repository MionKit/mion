// @ts-runtypes/devtools/rollup — the Rollup plugin (`unplugin.rollup`). Rollup
// resolves the real on-disk modules under `<genDir>/types/` natively, so the
// transform + generated cache modules behave the same as under Vite.
import {unplugin} from './unplugin.ts';

export * from './unplugin.ts';
export default unplugin.rollup;
