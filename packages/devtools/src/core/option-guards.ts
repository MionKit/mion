import {
  CLIENT_ROUTES_BUNDLE,
  CLIENT_ROUTES_FETCH,
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
} from './go-generated/runtypes-constants.generated.ts';

export const MODULE_MODES = [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES] as const;
const CLIENT_ROUTES = [CLIENT_ROUTES_BUNDLE, CLIENT_ROUTES_FETCH] as const;

/** Configs are often plain JS, so an unknown value is refused at the host boundary. **/
function assertOneOf(label: string, allowed: readonly string[], value: unknown): void {
  if (value === undefined || allowed.includes(value as string)) return;
  const expected = allowed.map((option) => `'${option}'`).join(' | ');
  throw new Error(`[mion] unknown ${label} ${JSON.stringify(value)}, expected ${expected}`);
}

export const assertValidModuleMode = (moduleMode: unknown): void => assertOneOf('moduleMode', MODULE_MODES, moduleMode);
export const assertValidClientRoutes = (routes: unknown): void => assertOneOf('client routes', CLIENT_ROUTES, routes);
