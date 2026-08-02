// Type SELECTION for the size lane — a RUNNER concern, not an oracle one. The size
// estimate is accurate for every serialisable kind, so the lane runs on all of
// them; this just excludes the genuinely non-data leaves (any / unknown / symbol /
// function / Promise / native typed-arrays / never / void) and class / callable
// refs, which DATA_GEN_OPTIONS doesn't emit anyway — a defensive guard.

import type {Decl, GeneratedType, TypeShape} from '../core/typeGen.ts';

function declMap(gen: GeneratedType): Map<string, Decl> {
  return new Map(gen.decls.map((decl) => [decl.name, decl] as const));
}

export function sizeLaneEligible(gen: GeneratedType): boolean {
  return eligible(gen.root, declMap(gen), new Set());
}

function eligible(shape: TypeShape, decls: Map<string, Decl>, seen: Set<string>): boolean {
  switch (shape.kind) {
    case 'any':
    case 'unknown':
    case 'symbol':
    case 'function':
    case 'promise':
    case 'never':
    case 'void':
    case 'arraybuffer':
    case 'sharedarraybuffer':
    case 'dataview':
    case 'typedarray':
      return false;
    // Format brands / negations: binary sizing keys off the positive base, but
    // respectBinarySize SHRINKS the mock distribution (string length, number
    // bounds) — a shrunken pool can sit entirely inside a format's constraint
    // (or a negation's complement can vanish from it), so the size-lane mock
    // either violates the format or exhausts negation rejection sampling.
    case 'format':
    case 'not':
      return false;
    case 'array':
    case 'set':
      return eligible(shape.elem, decls, seen);
    case 'record':
      return eligible(shape.value, decls, seen);
    case 'map':
      return eligible(shape.key, decls, seen) && eligible(shape.value, decls, seen);
    case 'tuple':
      return shape.elems.every((s) => eligible(s, decls, seen));
    case 'object':
      return (
        (!shape.index || eligible(shape.index, decls, seen)) &&
        shape.props.every((p) => p.method || eligible(p.shape, decls, seen))
      );
    case 'union':
    case 'intersection':
      return shape.members.every((s) => eligible(s, decls, seen));
    case 'ref': {
      if (seen.has(shape.name)) return false;
      const decl = decls.get(shape.name);
      if (!decl) return false;
      const next = new Set(seen).add(shape.name);
      if (decl.kind === 'type') return eligible(decl.shape, decls, next);
      if (decl.kind === 'interface')
        return !decl.calls?.length && decl.props.every((p) => p.method || eligible(p.shape, decls, next));
      return decl.kind === 'enum'; // enum ok; class excluded
    }
    // scalars / string / bigint / date / literal / regexp / null / undefined.
    default:
      return true;
  }
}
