import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
  type ModuleMode,
} from './go-generated/runtypes-constants.generated.ts';

export const MODULE_MODES = [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES] as const;

/** Rejects an unknown moduleMode at the host boundary. `undefined` means unset, always valid. **/
export function assertValidModuleMode(moduleMode: ModuleMode | undefined): void {
  if (moduleMode === undefined || MODULE_MODES.includes(moduleMode)) return;
  const expected = MODULE_MODES.map((mode) => `'${mode}'`).join(' | ');
  throw new Error(`[@mionjs/devtools] unknown moduleMode ${JSON.stringify(moduleMode)} — expected ${expected}`);
}
