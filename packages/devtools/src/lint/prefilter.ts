// Cheap text pre-filters the rules run BEFORE paying a resolver round trip: a file matching none of them can
// produce no diagnostic, so the rules skip it, the common case for most files in a lint run.

import {
  FRIENDLY_TEXT_NAME,
  FRIENDLY_TYPE_NAME,
  MARKER_COMMENT_PREFIX,
  MOCK_DATA_NAME,
} from '../core/go-generated/runtypes-constants.generated.ts';

// DEFAULT_MARKER_MODULE mirrors the unplugin's short-circuit: matched only as a quoted import specifier
// (subpaths included) so a path mention in a comment never forces a scan. The pure-fn registrars are probed
// separately because the marker package's OWN sources call them through relative imports, and `registerPureFn`
// is a substring of `registerPureFnFactory`, so one probe covers both.
const DEFAULT_MARKER_MODULE = '@mionjs/run-types';

// referencesMarkerModule gates the compiler-diagnostics pass: only files that can hold marker call sites go to
// the resolver. A file importing a configured marker package declares markers just as a mion import does, and
// the default package is always probed on top, matching the additive Go-side gate. With checkPackage:false a
// marker can come from anywhere, so the only sound answer is to let every file through.
export function referencesMarkerModule(text: string, markers?: {packages?: string[]; checkPackage?: boolean}): boolean {
  if (markers?.checkPackage === false) return true;
  const modules = [DEFAULT_MARKER_MODULE, ...(markers?.packages ?? [])];
  return modules.some((mod) => text.includes(`'${mod}`) || text.includes(`"${mod}`)) || text.includes('registerPureFn');
}

// enrichConstAnnotationPattern mirrors the Go-side guard's structural probe: a CONST declaration annotated with
// a DSL type, the shape every scaffold emits. The Go guard masks comments first; this one does not, so a rare
// comment-only match pays one round trip the authoritative Go guard then rejects. FRIENDLY_TYPE_NAME (legacy)
// stays in the alternation so mirrors authored before the friendly-text rename still match.
const enrichConstAnnotationPattern = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?const[ \\t]+[A-Za-z_$][A-Za-z0-9_$]*[ \\t]*:\\s*(?:${FRIENDLY_TEXT_NAME}|${FRIENDLY_TYPE_NAME}|${MOCK_DATA_NAME})[ \\t]*<`,
  'm'
);

// looksLikeEnrichmentFile gates the enrichment rules, the JS twin of the authoritative Go-side
// mirror.IsEnrichmentFile guard: a reconcile marker in its EMIT form, or the DSL-annotated const declaration.
// A file merely mentioning the tags or types in strings, prose or parameter annotations never matches.
export function looksLikeEnrichmentFile(text: string): boolean {
  return text.includes(MARKER_COMMENT_PREFIX) || enrichConstAnnotationPattern.test(text);
}

// ROUTER_MODULE and ROUTER_HELPERS gate the mion route rules: a route file need not import the marker package
// at all, so without this it would never reach the resolver. The helper names are matched WITH their opening
// paren because the router is often imported from a relative module (`import {mion} from './mion.ts'`) and the
// file then names the package nowhere. Permissive on purpose: one round trip on a file that merely spells
// `route(`, and the Go side stays authoritative about what is really a route.
const ROUTER_MODULE = '@mionjs/router';
const ROUTER_HELPERS = ['route', 'query', 'mutation', 'middleFn', 'headersFn'];
const routerHelperCallPattern = new RegExp(`(?:^|[^A-Za-z0-9_$])(?:${ROUTER_HELPERS.join('|')})\\s*\\(`);

export function referencesRouter(text: string): boolean {
  if (text.includes(`'${ROUTER_MODULE}`) || text.includes(`"${ROUTER_MODULE}`)) return true;
  if (text.includes('@mion:')) return true; // the JSDoc handler tags
  return routerHelperCallPattern.test(text);
}

// unsafePropertyNamePattern gates the unsafe-property-name rule, which reports a DECLARATION in any interface,
// type literal or class, so it must admit files that import nothing of ours: it covers types no route reaches
// yet. `__proto__` is matched anywhere, being rare enough that a stray mention costs one round trip.
const unsafePropertyNamePattern = /__proto__/;

export function declaresUnsafePropertyName(text: string): boolean {
  return unsafePropertyNamePattern.test(text);
}

// needsResolverPass is the union gate: one pass per file serves every rule, so a file goes over the wire when
// ANY family could report on it.
export function needsResolverPass(text: string, markers?: {packages?: string[]; checkPackage?: boolean}): boolean {
  return (
    referencesMarkerModule(text, markers) ||
    looksLikeEnrichmentFile(text) ||
    referencesRouter(text) ||
    declaresUnsafePropertyName(text)
  );
}
