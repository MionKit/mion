// Runtime twins of the structural format checks the Go emitters compile (internal/cachegen/typefunctions/formats/structural),
// so the mock walker can answer them at generation time. The generated VALIDATORS never import this, their checks are compiled.
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';

// 2020-12 JSON equality: numbers by mathematical value (0 and -0 collide), objects by unordered key set, arrays by order.
// Twin of the Go uniqueItemsCheck IIFE; the two MUST agree or mocks drift from validators.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? JSON.stringify(value) : typeof value + ':' + String(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

export function hasDuplicateItems(items: readonly unknown[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const key = canonicalJson(item);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function isStructuralFormat(annotation: FormatAnnotation | undefined): boolean {
  if (annotation === undefined) return false;
  switch (annotation.name) {
    case 'formattedArray':
    case 'formattedObject':
    case 'formattedSet':
    case 'formattedMap':
      return true;
    default:
      return false;
  }
}

// An array's items, a Set's members and a Map's `[key, value]` pairs are the same entry list to these keywords.
function itemKeywordsAccept(items: readonly unknown[], params: Record<string, unknown>): boolean {
  if (typeof params.minItems === 'number' && items.length < params.minItems) return false;
  if (typeof params.maxItems === 'number' && items.length > params.maxItems) return false;
  if (params.uniqueItems === true && hasDuplicateItems(items)) return false;
  return true;
}

/** True when the annotation is absent or non-structural: those families have their own mock paths.
 *  Rejection sampling keeps candidates this ACCEPTS; the child matcher rejects candidates this accepts on the child. **/
export function structuralFormatAccepts(value: unknown, annotation: FormatAnnotation | undefined): boolean {
  if (!annotation) return true;
  const params = (annotation.params ?? {}) as Record<string, unknown>;
  if (annotation.name === 'formattedArray') {
    return Array.isArray(value) && itemKeywordsAccept(value, params);
  }
  if (annotation.name === 'formattedSet') {
    return value instanceof Set && itemKeywordsAccept([...value], params);
  }
  if (annotation.name === 'formattedMap') {
    // Spreading a Map yields its `[key, value]` pairs, so `uniqueItems` compares pairs by value.
    return value instanceof Map && itemKeywordsAccept([...value], params);
  }
  if (annotation.name === 'formattedObject') {
    if (typeof value !== 'object' || value === null) return false;
    const keys = Object.keys(value as Record<string, unknown>);
    if (typeof params.minProperties === 'number' && keys.length < params.minProperties) return false;
    if (typeof params.maxProperties === 'number' && keys.length > params.maxProperties) return false;
    const closed = params.closed;
    if (Array.isArray(closed)) {
      const patterns = Array.isArray(params.closedPatterns)
        ? (params.closedPatterns as unknown[]).filter((entry): entry is string => typeof entry === 'string')
        : [];
      const allowed = (key: string) =>
        (closed as unknown[]).includes(key) || patterns.some((source) => new RegExp(source).test(key));
      if (!keys.every(allowed)) return false;
    }
    return true;
  }
  return true;
}
