// Runtime twins of the structural format checks the Go emitters compile
// (arrayFormat / objectFormat — internal/cachegen/typefunctions/formats/
// structural). The mock walker needs the same answers at generation time:
// rejection sampling over annotated bases and honest negation-child tests.
// The generated VALIDATORS never import this — their checks are compiled.
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';

// 2020-12 JSON equality via canonical stringify: numbers by mathematical
// value (0 and -0 collide, 1 and 1.0 collide), objects by unordered key set,
// arrays by order. Twin of the Go uniqueItemsCheck IIFE — the two MUST agree
// or mocks drift from validators.
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
  return annotation !== undefined && (annotation.name === 'arrayFormat' || annotation.name === 'objectFormat');
}

/** Does `value` satisfy the structural format annotation? True when the
 *  annotation is absent or belongs to a non-structural family (those have
 *  their own mock paths). Rejection sampling keeps candidates this ACCEPTS;
 *  the negation matcher rejects candidates this accepts on the child. **/
export function structuralFormatAccepts(value: unknown, annotation: FormatAnnotation | undefined): boolean {
  if (!annotation) return true;
  const params = (annotation.params ?? {}) as Record<string, unknown>;
  if (annotation.name === 'arrayFormat') {
    if (!Array.isArray(value)) return false;
    if (typeof params.minItems === 'number' && value.length < params.minItems) return false;
    if (typeof params.maxItems === 'number' && value.length > params.maxItems) return false;
    if (params.uniqueItems === true && hasDuplicateItems(value)) return false;
    return true;
  }
  if (annotation.name === 'objectFormat') {
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
