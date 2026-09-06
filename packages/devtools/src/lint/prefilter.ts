// Cheap textual pre-filters the lint rules run BEFORE paying a resolver
// round trip. A file that references no marker module, looks like no
// enrichment mirror and could declare no mion handler can produce no
// diagnostics, so the rules skip it entirely — the common case for most files
// in a lint run.

import {
  FRIENDLY_TEXT_NAME,
  FRIENDLY_TYPE_NAME,
  MARKER_COMMENT_PREFIX,
  MOCK_DATA_NAME,
} from '../core/go-generated/runtypes-constants.generated.ts';

// DEFAULT_MARKER_MODULE mirrors the unplugin's short-circuit: match the package
// only as a quoted import specifier (`'@mionjs/run-types`, `"@mionjs/run-types`,
// incl. subpaths) so a path mention in a comment never forces a scan.
// The pure-fn registrars are checked separately because the marker package's
// OWN sources call them via relative imports. `registerPureFn` is a substring
// of `registerPureFnFactory`, so probing it covers both named registrars.
const DEFAULT_MARKER_MODULE = '@mionjs/run-types';

// referencesMarkerModule gates the compiler-diagnostics pass (severity-tier
// rules): only files that can contain marker call sites go to the resolver.
// extraPackages are the project's configured marker packages (tsconfig
// `markers.packages`): a file importing one of those declares markers just as
// a mion import does, so skipping it would lose its diagnostics. The
// default package is always probed, matching the additive Go-side gate. Pass
// checkPackage:false (the package gate disabled) to stop pre-filtering by
// import specifier altogether — a marker can then come from anywhere, so the
// only sound answer is to let every file through.
export function referencesMarkerModule(text: string, markers?: {packages?: string[]; checkPackage?: boolean}): boolean {
  if (markers?.checkPackage === false) return true;
  const modules = [DEFAULT_MARKER_MODULE, ...(markers?.packages ?? [])];
  return modules.some((mod) => text.includes(`'${mod}`) || text.includes(`"${mod}`)) || text.includes('registerPureFn');
}

// enrichConstAnnotationPattern mirrors the Go-side guard's structural probe: a
// (possibly exported) CONST declaration annotated with a DSL type — the exact
// shape every scaffold emits. The Go guard additionally masks comments before
// matching (a JSDoc code example there never counts); this pre-filter skips
// the masking — a rare comment-only match just pays one resolver round trip
// that the authoritative Go guard then rejects.
// FRIENDLY_TYPE_NAME (legacy) stays in the alternation so mirrors authored
// before the friendly-text rename still match the pre-filter.
const enrichConstAnnotationPattern = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?const[ \\t]+[A-Za-z_$][A-Za-z0-9_$]*[ \\t]*:\\s*(?:${FRIENDLY_TEXT_NAME}|${FRIENDLY_TYPE_NAME}|${MOCK_DATA_NAME})[ \\t]*<`,
  'm'
);

// looksLikeEnrichmentFile gates the enrichment rules — the JS twin of the
// Go-side mirror.IsEnrichmentFile guard (which stays authoritative; this one
// only avoids pointless round trips, so it mirrors the same signals): a
// reconcile marker in its EMIT form (the `/** @rtType ` prefix MarkerComment
// writes), or the DSL-annotated const declaration. Files that merely mention
// the tags or types in strings, prose, or parameter annotations never match,
// so they never pay a round trip and never fire.
export function looksLikeEnrichmentFile(text: string): boolean {
  return text.includes(MARKER_COMMENT_PREFIX) || enrichConstAnnotationPattern.test(text);
}

// ROUTER_MODULE and ROUTER_HELPERS gate the mion route rules. A route file need
// not import the marker package at all, so without this it would be skipped
// before the resolver was ever asked and would never be linted.
//
// The package is matched as a quoted import specifier, like the marker one. The
// helper names are matched WITH their opening paren, and with the leading dot
// for the usual `mion.route(...)` form or a bare word boundary for a
// destructured `route(...)`, because the router is often imported from a
// relative module (`import {mion} from './mion.ts'`) and the file then names the
// package nowhere. This is deliberately permissive: it costs one round trip on a
// file that merely spells `route(`, and the Go side stays authoritative about
// what is actually a route.
const ROUTER_MODULE = '@mionjs/router';
const ROUTER_HELPERS = ['route', 'query', 'mutation', 'middleFn', 'headersFn'];
const routerHelperCallPattern = new RegExp(`(?:^|[^A-Za-z0-9_$])(?:${ROUTER_HELPERS.join('|')})\\s*\\(`);

// referencesRouter gates the mion route rules: does this file look like it could
// declare a handler at all.
export function referencesRouter(text: string): boolean {
  if (text.includes(`'${ROUTER_MODULE}`) || text.includes(`"${ROUTER_MODULE}`)) return true;
  if (text.includes('@mion:')) return true; // the JSDoc handler tags
  return routerHelperCallPattern.test(text);
}

// unsafePropertyNamePattern gates the unsafe-property-name rule. That rule
// reports a DECLARATION, in any interface, type literal or class, so it fires on
// files that import nothing of ours — which is the point of it, since it covers
// types no route reaches yet. Without its own probe those files would be skipped
// before the resolver was ever asked.
//
// `__proto__` and `prototype` are matched anywhere: both are rare enough that a
// stray mention costs one round trip and nothing else. `constructor` is not, so
// it is matched only in the shape a PROPERTY takes (`constructor:` or
// `constructor?:`), which leaves every class constructor alone.
const unsafePropertyNamePattern = /__proto__|prototype|(?:^|[^.\w$])constructor\s*\??\s*:/;

// declaresUnsafePropertyName gates the unsafe-property-name rule.
export function declaresUnsafePropertyName(text: string): boolean {
  return unsafePropertyNamePattern.test(text);
}

// needsResolverPass is the union gate the rules share: one resolver pass per
// file serves every rule, so the file goes over the wire when ANY family could
// report on it. markers is the project's configured marker-package setting,
// forwarded to referencesMarkerModule.
export function needsResolverPass(text: string, markers?: {packages?: string[]; checkPackage?: boolean}): boolean {
  return (
    referencesMarkerModule(text, markers) ||
    looksLikeEnrichmentFile(text) ||
    referencesRouter(text) ||
    declaresUnsafePropertyName(text)
  );
}
