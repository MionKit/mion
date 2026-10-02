import {CLIENT_ROUTES_BUNDLE, CLIENT_ROUTES_FETCH, type ClientRoutes} from './go-generated/runtypes-constants.generated.ts';

export const CLIENT_ROUTES = [CLIENT_ROUTES_BUNDLE, CLIENT_ROUTES_FETCH] as const;

/** Configs are often plain JS, so an unknown mode is refused here rather than read as the default. */
export function assertValidClientRoutes(clientRoutes: unknown): void {
  if (clientRoutes === undefined || CLIENT_ROUTES.includes(clientRoutes as ClientRoutes)) return;
  const expected = CLIENT_ROUTES.map((mode) => `'${mode}'`).join(' or ');
  throw new Error(`[mion] client routes must be ${expected} (got ${JSON.stringify(clientRoutes)}).`);
}
