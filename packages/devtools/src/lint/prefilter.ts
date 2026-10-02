// Cheap text pre-filters the rules run BEFORE paying a resolver round trip: a file matching none of them can
// produce no diagnostic, so the rules skip it, the common case for most files in a lint run.

import {FRIENDLY_TEXT_NAME, MARKER_COMMENT_PREFIX, MOCK_DATA_NAME} from '../core/go-generated/runtypes-constants.generated.ts';
import {mayHoldMarkerCalls, type MarkerGateOptions} from '../core/markerImports.ts';

// Gates the compiler-diagnostics pass with the build fallback's own gate, so lint and build admit the same files.
export function referencesMarkerModule(text: string, file?: string, markers?: MarkerGateOptions): boolean {
  return mayHoldMarkerCalls(text, file, markers);
}

// Mirrors the Go guard's const-annotation probe without masking comments: a comment-only match costs one round trip.
const enrichConstAnnotationPattern = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?const[ \\t]+[A-Za-z_$][A-Za-z0-9_$]*[ \\t]*:\\s*(?:${FRIENDLY_TEXT_NAME}|${MOCK_DATA_NAME})[ \\t]*<`,
  'm'
);

// looksLikeEnrichmentFile admits enrichment files, the JS twin of the authoritative Go-side
// mirror.IsEnrichmentFile guard: a reconcile marker in its EMIT form, or the DSL-annotated const declaration.
// A file merely mentioning the tags or types in strings, prose or parameter annotations never matches.
export function looksLikeEnrichmentFile(text: string): boolean {
  return text.includes(MARKER_COMMENT_PREFIX) || enrichConstAnnotationPattern.test(text);
}

// ROUTER_MODULE and ROUTER_HELPERS admit route files: a route file need not import the marker package
// at all, so without this it would never reach the resolver. The helper names are matched WITH their opening
// paren because the router is often imported from a relative module (`import {mion} from './mion.ts'`) and the
// file then names the package nowhere. Permissive on purpose: one round trip on a file that merely spells
// `route(`, and the Go side stays authoritative about what is really a route.
const ROUTER_MODULE = '@mionjs/router';
const ROUTER_HELPERS = ['route', 'query', 'mutation', 'middleware', 'headersMiddleware'];
const routerHelperCallPattern = new RegExp(`(?:^|[^A-Za-z0-9_$])(?:${ROUTER_HELPERS.join('|')})\\s*\\(`);

export function referencesRouter(text: string): boolean {
  if (text.includes(`'${ROUTER_MODULE}`) || text.includes(`"${ROUTER_MODULE}`)) return true;
  if (text.includes('@mion:')) return true; // the JSDoc handler tags
  return routerHelperCallPattern.test(text);
}

// unsafePropertyNamePattern gates the UPN check, which reports a DECLARATION in any interface,
// type literal or class, so it must admit files that import nothing of ours: it covers types no route reaches
// yet. `__proto__` is matched anywhere, being rare enough that a stray mention costs one round trip.
const unsafePropertyNamePattern = /__proto__/;

export function declaresUnsafePropertyName(text: string): boolean {
  return unsafePropertyNamePattern.test(text);
}

// One pass per file serves every rule, so a file goes over the wire when any family could report on it.
export function needsResolverPass(text: string, file?: string, markers?: MarkerGateOptions): boolean {
  return (
    referencesMarkerModule(text, file, markers) ||
    looksLikeEnrichmentFile(text) ||
    referencesRouter(text) ||
    declaresUnsafePropertyName(text)
  );
}
