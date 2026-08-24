// @ts-runtypes/devtools/rolldown — the Rolldown plugin (`unplugin.rolldown`).
// Rolldown speaks Rollup's plugin API, so the transform + generated cache
// modules behave the same as under Rollup/Vite (Vite 8 already runs on Rolldown
// internally, so its /vite entry covers Vite users; this is for consumers
// invoking Rolldown directly).
import {unplugin} from './unplugin.ts';

export * from './unplugin.ts';
export default unplugin.rolldown;
