// For consumers invoking Rolldown directly: Vite 8 runs on Rolldown internally, so the /vite entry covers Vite users.
import {unplugin} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';
export default unplugin.rolldown;
