// Rollup resolves the on-disk modules under `<genDir>/types/` natively, so this behaves the same as under Vite.
import {unplugin} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';
export default unplugin.rollup;
