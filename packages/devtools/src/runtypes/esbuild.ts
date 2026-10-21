// esbuild has no transform phase, so unplugin emulates it via onLoad and this entry loads every matched module.
import {unplugin} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';
export default unplugin.esbuild;
