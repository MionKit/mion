import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
  type ModuleMode,
} from './go-generated/runtypes-constants.generated.ts';

// Every valid moduleMode in one place: the guard below tests membership against this and
// builds its message from it. A tuple rather than a chain of `!==` comparisons, which
// narrows the last constant to `never` at the throw site.
export const MODULE_MODES = [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES] as const;

/** Rejects a moduleMode the binary would reject anyway, at the host boundary where the message
 *  can still name the option. `undefined` means "not set", which is always valid. **/
export function assertValidModuleMode(moduleMode: ModuleMode | undefined): void {
  if (moduleMode === undefined || MODULE_MODES.includes(moduleMode)) return;
  const expected = MODULE_MODES.map((mode) => `'${mode}'`).join(' | ');
  throw new Error(`[@ts-runtypes/devtools] unknown moduleMode ${JSON.stringify(moduleMode)} — expected ${expected}`);
}
