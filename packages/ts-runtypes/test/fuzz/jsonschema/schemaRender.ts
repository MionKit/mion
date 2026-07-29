// M7 translation fuzz lane (docs/done/json-schema-first-class-implementation.md):
// normalize a generated TypeShape into the JSON-Schema-EXPRESSIBLE subset, then
// render that ONE normalized shape twice — as a TypeScript type expression
// (typeGen's own renderType) and as a draft 2020-12 schema literal. The
// integration test compiles both renderings in one fixture and asserts the two
// reflection ids converge, so the oracle is `FromJsonSchema` translation
// fidelity over the shared shape space (never the normalization choices, which
// both sides inherit identically).
//
// The normalizer is TOTAL over the wild TypeShape space. Kinds with no schema
// INPUT spelling are REPLACED (not dropped) so the fuzz surface keeps its
// nesting: Map→Record, Set→Array, Promise→its value, Date/RegExp/symbol/
// binary/function→string, bigint→number, undefined/void→null, any→unknown.
// `unknown` renders `{}` (the always-true schema) and `never` renders
// `{enum: []}` (the empty enum — `E[number]` of `[]` — because the boolean
// schema `false` is only legal at `items`, not in properties/prefixItems).
// Structure that IS expressible survives: objects (required inversion,
// string-keyed index → additionalProperties, mixed form), closed tuples
// (prefixItems + minItems + items:false), unions (anyOf), intersections
// (allOf), and RECURSIVE interfaces — declared interfaces become root-level
// `$defs` entries referenced via `$ref: '#/$defs/<name>'` (the M6 surface).
//
// Erased on the way in (both sides lose them together): `readonly` property
// modifiers, method/function-typed properties (dropped — no schema spelling),
// number/symbol-only index signatures, enum refs (inlined to their literal
// union — enums are nominal), class refs (nominal too → string).

import type {Decl, EnumMember, GeneratedType, PropShape, TypeShape} from '../core/typeGen.ts';

/** A normalized generated type: the root shape plus the interface decls that
 *  survived normalization (each becomes a `$defs` entry / a rendered
 *  `interface` decl). Every shape inside is schema-expressible. **/
export interface SchemaExpressible {
  root: TypeShape;
  defs: {name: string; props: PropShape[]}[];
}

const STRING: TypeShape = {kind: 'string'};

/** Normalize a whole generated type (decls + root) into the expressible
 *  subset. Interfaces stay as ref targets ($defs); enums/classes are erased at
 *  their use sites, so only interfaces reachable from the normalized root
 *  survive. **/
export function toSchemaExpressible(gen: GeneratedType): SchemaExpressible {
  const enums = new Map<string, EnumMember[]>();
  const interfaces = new Map<string, PropShape[]>();
  const classes = new Set<string>();
  for (const decl of gen.decls) {
    if (decl.kind === 'enum') enums.set(decl.name, decl.members);
    else if (decl.kind === 'interface') interfaces.set(decl.name, decl.props);
    else if (decl.kind === 'class') classes.add(decl.name);
    // decl.kind === 'type' never comes out of genType; treat as absent.
  }
  const ctx = {enums, interfaces, classes};
  const root = normalizeShape(gen.root, ctx);
  const defs: SchemaExpressible['defs'] = [];
  // Normalize every interface, then keep only the ones reachable from the root
  // (an interface referenced only by an erased class/enum would be an orphan
  // $defs entry — harmless for convergence but noise in the fixture).
  const normalized = new Map<string, PropShape[]>();
  for (const [name, props] of interfaces) normalized.set(name, normalizeProps(props, ctx));
  const reached = new Set<string>();
  const stack: string[] = [];
  collectShapeRefs(root, stack);
  while (stack.length) {
    const name = stack.pop()!;
    if (reached.has(name) || !normalized.has(name)) continue;
    reached.add(name);
    for (const prop of normalized.get(name)!) collectShapeRefs(prop.shape, stack);
  }
  for (const [name, props] of normalized) if (reached.has(name)) defs.push({name, props});
  return {root, defs};
}

interface NormCtx {
  enums: Map<string, EnumMember[]>;
  interfaces: Map<string, PropShape[]>;
  classes: Set<string>;
}

function normalizeShape(shape: TypeShape, ctx: NormCtx): TypeShape {
  switch (shape.kind) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'null':
    case 'literal':
    case 'unknown':
    case 'never':
      return shape;
    case 'any':
      return {kind: 'unknown'};
    case 'bigint':
      return {kind: 'number'};
    case 'undefined':
    case 'void':
      return {kind: 'null'};
    case 'date':
    case 'regexp':
    case 'symbol':
    case 'arraybuffer':
    case 'sharedarraybuffer':
    case 'dataview':
    case 'typedarray':
    case 'function':
      return STRING;
    case 'array':
      return {kind: 'array', elem: normalizeShape(shape.elem, ctx)};
    case 'set':
      return {kind: 'array', elem: normalizeShape(shape.elem, ctx)};
    case 'tuple':
      return {kind: 'tuple', elems: shape.elems.map((e) => normalizeShape(e, ctx))};
    case 'record':
      return {kind: 'record', value: normalizeShape(shape.value, ctx)};
    case 'map':
      return {kind: 'record', value: normalizeShape(shape.value, ctx)};
    case 'promise':
      return normalizeShape(shape.value, ctx);
    case 'union':
      return {kind: 'union', members: shape.members.map((m) => normalizeShape(m, ctx))};
    case 'intersection':
      return {kind: 'intersection', members: shape.members.map((m) => normalizeShape(m, ctx))};
    case 'object': {
      const props = normalizeProps(shape.props, ctx);
      // Only a string-keyed index has a schema spelling (additionalProperties);
      // number/symbol-only index signatures are erased.
      const keepIndex = shape.index !== undefined && (shape.indexKey ?? ['string']).includes('string');
      const index = keepIndex ? normalizeShape(shape.index!, ctx) : undefined;
      if (props.length === 0 && index === undefined) {
        // `{}` (empty TS object literal) and `{type: 'object'}` denote DIFFERENT
        // types ({} vs object) — sidestep by widening to Record<string, unknown>.
        return {kind: 'record', value: {kind: 'unknown'}};
      }
      return index === undefined ? {kind: 'object', props} : {kind: 'object', props, index, indexKey: ['string']};
    }
    case 'ref': {
      const enumMembers = ctx.enums.get(shape.name);
      if (enumMembers) return enumToUnion(enumMembers);
      if (ctx.classes.has(shape.name)) return STRING; // nominal — no schema spelling
      if (ctx.interfaces.has(shape.name)) return shape; // survives as a $defs ref
      return STRING; // dangling ref (pruned decl) — degrade like a class ref
    }
  }
}

function normalizeProps(props: PropShape[], ctx: NormCtx): PropShape[] {
  const out: PropShape[] = [];
  for (const prop of props) {
    // Method / function-typed properties have no schema spelling — dropped.
    if (prop.method || prop.shape.kind === 'function') continue;
    out.push({name: prop.name, optional: prop.optional, readonly: false, method: false, shape: normalizeShape(prop.shape, ctx)});
  }
  return out;
}

/** An enum ref inlines to the union of its member VALUES: string-valued
 *  members keep their strings, auto-numbered members are their indices
 *  (typeGen guarantees member i === i). Enums are nominal in TS, so the
 *  type-first side must lose the enum identity too — both renderings share
 *  this literal union. **/
function enumToUnion(members: EnumMember[]): TypeShape {
  const literals: TypeShape[] = members.map((m, i) => ({kind: 'literal', value: m.value ?? i}));
  return literals.length === 1 ? literals[0] : {kind: 'union', members: literals};
}

/** KNOWN M6 DIVERGENCE GUARD (docs/todos/json-schema-shared-recursive-container-id-divergence.md):
 *  a fixture where the SAME structurally-rendered container subtree wraps a
 *  recursive-interface ref in TWO OR MORE positions does not converge — the
 *  type-first checker interns the container once (one shared node) while each
 *  schema literal occurrence builds its own, and the id computer folds that
 *  sharing difference into the id when the subtree participates in a cycle.
 *  (Direct refs canonicalize through the single $defs lookup, and
 *  non-recursive duplicates canonicalize structurally — both converge; probes
 *  pinned in the todo.) The fuzz lane SKIPS these fixtures, counted +
 *  reported, until the divergence is fixed Go-side. **/
export function hasSharedRecursiveContainer(norm: SchemaExpressible): boolean {
  // Which defs are recursive (reach themselves through the defs graph)?
  const defProps = new Map(norm.defs.map((d) => [d.name, d.props] as const));
  const reaches = (start: string): boolean => {
    const seen = new Set<string>();
    const stack: string[] = [];
    for (const prop of defProps.get(start) ?? []) collectShapeRefs(prop.shape, stack);
    while (stack.length) {
      const name = stack.pop()!;
      if (name === start) return true;
      if (seen.has(name) || !defProps.has(name)) continue;
      seen.add(name);
      for (const prop of defProps.get(name)!) collectShapeRefs(prop.shape, stack);
    }
    return false;
  };
  const recursiveDefs = new Set(norm.defs.filter((d) => reaches(d.name)).map((d) => d.name));
  if (recursiveDefs.size === 0) return false;

  // Count every non-ref subtree that transitively contains a recursive-def
  // ref, keyed by its structural signature; ≥2 occurrences = the known class.
  const counts = new Map<string, number>();
  let shared = false;
  const visit = (shape: TypeShape): boolean => {
    // Returns whether this subtree contains a recursive-def ref.
    let contains = false;
    switch (shape.kind) {
      case 'ref':
        return recursiveDefs.has(shape.name);
      case 'array':
      case 'set':
        contains = visit(shape.elem);
        break;
      case 'record':
      case 'promise':
        contains = visit(shape.value);
        break;
      case 'map':
        contains = visit(shape.key) || visit(shape.value);
        break;
      case 'tuple':
        for (const e of shape.elems) if (visit(e)) contains = true;
        break;
      case 'union':
      case 'intersection':
        for (const m of shape.members) if (visit(m)) contains = true;
        break;
      case 'function':
        for (const p of shape.params) if (visit(p)) contains = true;
        if (visit(shape.ret)) contains = true;
        break;
      case 'object':
        for (const p of shape.props) if (visit(p.shape)) contains = true;
        if (shape.index && visit(shape.index)) contains = true;
        break;
      default:
        return false;
    }
    if (contains) {
      const signature = signatureOf(shape);
      const n = (counts.get(signature) ?? 0) + 1;
      counts.set(signature, n);
      if (n >= 2) shared = true;
    }
    return contains;
  };
  visit(norm.root);
  for (const def of norm.defs) for (const prop of def.props) visit(prop.shape);
  return shared;
}

/** Structural signature for the divergence guard — a stable render of the
 *  subtree (JSON of the shape is deterministic and cheap). **/
function signatureOf(shape: TypeShape): string {
  return JSON.stringify(shape);
}

function collectShapeRefs(shape: TypeShape, out: string[]): void {
  switch (shape.kind) {
    case 'ref':
      out.push(shape.name);
      return;
    case 'array':
    case 'set':
      return collectShapeRefs(shape.elem, out);
    case 'record':
    case 'promise':
      return collectShapeRefs(shape.value, out);
    case 'map':
      collectShapeRefs(shape.key, out);
      collectShapeRefs(shape.value, out);
      return;
    case 'tuple':
      shape.elems.forEach((e) => collectShapeRefs(e, out));
      return;
    case 'union':
    case 'intersection':
      shape.members.forEach((m) => collectShapeRefs(m, out));
      return;
    case 'function':
      shape.params.forEach((p) => collectShapeRefs(p, out));
      collectShapeRefs(shape.ret, out);
      return;
    case 'object':
      shape.props.forEach((p) => collectShapeRefs(p.shape, out));
      if (shape.index) collectShapeRefs(shape.index, out);
      return;
    default:
      return;
  }
}

// =============================================================================
// Rendering — normalized shape → draft 2020-12 schema literal text.
// =============================================================================

/** Render the schema literal for a normalized type: the root schema, with the
 *  surviving interfaces as a `$defs` block. The output is a fully static
 *  object literal (inline-able at a `CompTimeArgs` call site). **/
export function renderSchemaLiteral(norm: SchemaExpressible): string {
  const rootLiteral = renderSchema(norm.root);
  if (norm.defs.length === 0) return rootLiteral;
  const defs = norm.defs.map((d) => `${d.name}: ${renderSchema({kind: 'object', props: d.props})}`).join(', ');
  // Splice $defs into the root literal: `{$defs: {...}, <root body>}`. A ref
  // root (`{$ref: '#/$defs/N0'}`) splices the same way.
  return `{$defs: {${defs}}, ${rootLiteral.slice(1)}`;
}

function renderSchema(shape: TypeShape): string {
  switch (shape.kind) {
    case 'number':
      return `{type: 'number'}`;
    case 'string':
      return `{type: 'string'}`;
    case 'boolean':
      return `{type: 'boolean'}`;
    case 'null':
      return `{type: 'null'}`;
    case 'literal':
      return `{const: ${typeof shape.value === 'string' ? JSON.stringify(shape.value) : String(shape.value)}}`;
    case 'unknown':
      return `{}`; // the always-true schema
    case 'never':
      return `{enum: []}`; // empty enum — `false` is not legal as a sub-schema
    case 'array':
      return `{type: 'array', items: ${renderSchema(shape.elem)}}`;
    case 'tuple':
      // Generated tuples are all-required and closed: every position below
      // minItems is required, items: false forbids extras.
      return `{type: 'array', prefixItems: [${shape.elems.map(renderSchema).join(', ')}], minItems: ${shape.elems.length}, items: false}`;
    case 'record':
      return `{type: 'object', additionalProperties: ${renderSchema(shape.value)}}`;
    case 'object': {
      const properties = shape.props.map((p) => `${JSON.stringify(p.name)}: ${renderSchema(p.shape)}`).join(', ');
      const required = shape.props.filter((p) => !p.optional).map((p) => JSON.stringify(p.name));
      const parts = [`type: 'object'`, `properties: {${properties}}`];
      if (required.length) parts.push(`required: [${required.join(', ')}]`);
      if (shape.index) parts.push(`additionalProperties: ${renderSchema(shape.index)}`);
      return `{${parts.join(', ')}}`;
    }
    case 'union':
      return `{anyOf: [${shape.members.map(renderSchema).join(', ')}]}`;
    case 'intersection':
      return `{allOf: [${shape.members.map(renderSchema).join(', ')}]}`;
    case 'ref':
      return `{$ref: '#/$defs/${shape.name}'}`;
    default:
      // Unreachable on normalized shapes — normalizeShape is total over the
      // inexpressible kinds. Fail loud if a caller skips normalization.
      throw new Error(`renderSchema: non-expressible shape kind '${shape.kind}' — run toSchemaExpressible first`);
  }
}
