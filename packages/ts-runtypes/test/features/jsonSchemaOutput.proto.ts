// PROTOTYPE (investigation: docs/investigations/json-schema/) — derived JSON
// Schema OUTPUT: walk the knotted RunType graph (`getRunType<T>()`) and emit a
// draft 2020-12 schema of the WIRE projection of `T`. NOT public API; lives
// beside the test that proves it.
//
// Architecture mirrors the mock walker (mocking/mockType.ts): a runtime
// interpreter over the reflected node graph, demanded through the reflection
// root. A production `createJsonSchemaFn<T>()` can keep this walker (zero Go
// changes, pays the reflection payload) or move it into a Go emitter family
// (per-type constant, build-time diagnostics) — trade-off analysed in
// docs/investigations/json-schema/03-phase2-derived-output.md.
//
// Behavior contract (per the phase-1 mapping doc):
//   - DataOnly discipline: non-data members (symbol / function / method /
//     callSignature / promise / never / non-serializable natives / RegExp
//     values) DROP silently-with-warning at property position and THROW at
//     root / propagating positions.
//   - Wire projection: Date/Temporal → ISO strings, bigint → digit string,
//     Map/Set → `{mapSet: 'wire'}` opt-in (array-of-pairs / array+uniqueItems);
//     default `{mapSet: 'error'}` throws (the DataOnly instinct).
//   - Formats → hard keywords where 2020-12 has them, Warnings where it does
//     not (flags on patterns, decomposed email/domain params, date bounds, …).
//   - Recursion: nodes flagged `isCircular` are hoisted into `$defs` and
//     referenced with `$ref` (JSON Schema's only recursion mechanism).

import {RunTypeKind, RunTypeSubKind, type RunType, type FormatAnnotation} from '@ts-runtypes/core';

const K = RunTypeKind;
const SK = RunTypeSubKind;

// A JSON Schema value we emit — plain data, no class.
export type JsonSchemaOut = boolean | {[keyword: string]: unknown};

export interface RunTypeToJsonSchemaOptions {
  /** Map/Set handling: 'error' (default — throw, the DataOnly instinct) or
   *  'wire' (emit the JSON family's wire shape: entry pairs / array+uniqueItems). **/
  mapSet?: 'error' | 'wire';
  /** Root `$id` to stamp on the emitted document. **/
  id?: string;
}

export interface JsonSchemaResult {
  schema: {[keyword: string]: unknown};
  warnings: string[];
}

const UUID_V4_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const UUID_V7_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const BIGINT_WIRE_PATTERN = '^-?[0-9]+$';

// Sentinel returned by walk() for a property whose value has no wire form —
// the property is dropped from the parent (DataOnly semantics).
const DROP = Symbol('drop');

const NON_DATA_KINDS = new Set<number>([K.never, K.symbol, K.function, K.method, K.methodSignature, K.callSignature]);

interface WalkContext {
  options: Required<Pick<RunTypeToJsonSchemaOptions, 'mapSet'>>;
  warnings: string[];
  defs: Map<string, JsonSchemaOut | null>; // null = reserved (in progress)
  stack: RunType[];
}

function kindOf(node: RunType): number {
  return node.kind as number;
}
function subKindOf(node: RunType): number {
  return (node.subKind as number | undefined) ?? 0;
}

function fail(message: string): never {
  throw new Error(`[runTypeFromJsonSchema] ${message}`);
}

function isNonData(node: RunType): boolean {
  if (NON_DATA_KINDS.has(kindOf(node))) return true;
  if (kindOf(node) === K.class && subKindOf(node) === SK.nonSerializable) return true;
  // RegExp VALUES and thenables have no wire form (validation-only kinds).
  return kindOf(node) === K.regexp || kindOf(node) === K.promise;
}

// ─────────────────────────── format keyword merge ───────────────────

type MutableSchema = {[keyword: string]: unknown};

function warnParam(ctx: WalkContext, format: string, param: string, reason: string): void {
  ctx.warnings.push(`format '${format}': param '${param}' has no JSON Schema equivalent (${reason}) — dropped`);
}

function applyPattern(schema: MutableSchema, ctx: WalkContext, format: string, pattern: unknown): void {
  const source = (pattern as {source?: unknown})?.source;
  const flags = (pattern as {flags?: unknown})?.flags;
  // JSON Schema `pattern` carries no flags slot — emitting a flagged source
  // would change its meaning, and omission only loosens (never lies).
  if (typeof source !== 'string') return;
  if (typeof flags === 'string' && flags.replace('u', '') !== '') {
    warnParam(ctx, format, 'pattern.flags', `'${String(flags)}' cannot ride JSON Schema pattern`);
    return;
  }
  schema.pattern = source;
}

function applyStringFormatParams(schema: MutableSchema, ctx: WalkContext, params: Record<string, unknown>): void {
  if (typeof params.minLength === 'number') schema.minLength = params.minLength;
  if (typeof params.maxLength === 'number') schema.maxLength = params.maxLength;
  if (typeof params.length === 'number') {
    schema.minLength = params.length;
    schema.maxLength = params.length;
  }
  if (params.pattern !== undefined) applyPattern(schema, ctx, 'stringFormat', params.pattern);
  const allowed = (params.allowedValues as {val?: unknown})?.val;
  if (Array.isArray(allowed)) schema.enum = [...allowed];
  const disallowed = (params.disallowedValues as {val?: unknown})?.val;
  if (Array.isArray(disallowed)) schema.not = {enum: [...disallowed]};
  if (params.allowedChars !== undefined) warnParam(ctx, 'stringFormat', 'allowedChars', 'needs char-class synthesis');
  if (params.disallowedChars !== undefined) warnParam(ctx, 'stringFormat', 'disallowedChars', 'needs char-class synthesis');
  if (Array.isArray(params.mockSamples)) schema.examples = [...params.mockSamples];
  // Transform params (trim/lowercase/…) are validate-invisible on both sides: no keyword, no warning.
}

function applyBoundWarnings(ctx: WalkContext, format: string, params: Record<string, unknown>): void {
  for (const bound of ['min', 'max', 'gt', 'lt']) {
    if (params[bound] !== undefined) warnParam(ctx, format, bound, 'no value-comparison keyword for date/time strings');
  }
}

function applyFormat(base: MutableSchema, annotation: FormatAnnotation, ctx: WalkContext): MutableSchema {
  const params = (annotation.params ?? {}) as Record<string, unknown>;
  const schema = base;
  switch (annotation.name) {
    case 'stringFormat':
      applyStringFormatParams(schema, ctx, params);
      return schema;
    case 'uuid':
      schema.format = 'uuid';
      if (params.version === '4') schema.pattern = UUID_V4_PATTERN;
      if (params.version === '7') schema.pattern = UUID_V7_PATTERN;
      return schema;
    case 'email':
      schema.format = 'email';
      if (typeof params.minLength === 'number') schema.minLength = params.minLength;
      if (typeof params.maxLength === 'number') schema.maxLength = params.maxLength;
      if (params.pattern !== undefined) applyPattern(schema, ctx, 'email', params.pattern);
      if (params.localPart !== undefined) warnParam(ctx, 'email', 'localPart', 'decomposed sub-validators exceed keywords');
      if (params.domain !== undefined) warnParam(ctx, 'email', 'domain', 'decomposed sub-validators exceed keywords');
      return schema;
    case 'domain':
      schema.format = 'hostname';
      if (typeof params.minLength === 'number') schema.minLength = params.minLength;
      if (typeof params.maxLength === 'number') schema.maxLength = params.maxLength;
      if (params.pattern !== undefined) applyPattern(schema, ctx, 'domain', params.pattern);
      for (const param of ['names', 'tld', 'minParts', 'maxParts']) {
        if (params[param] !== undefined) warnParam(ctx, 'domain', param, 'decomposed sub-validators exceed keywords');
      }
      return schema;
    case 'ip': {
      if (params.allowPort === true) {
        warnParam(ctx, 'ip', 'allowPort', 'an ip:port string is not a valid ipv4/ipv6 format');
        return schema;
      }
      if (params.version === 4) schema.format = 'ipv4';
      else if (params.version === 6) schema.format = 'ipv6';
      else
        return {
          anyOf: [
            {type: 'string', format: 'ipv4'},
            {type: 'string', format: 'ipv6'},
          ],
        };
      return schema;
    }
    case 'url':
      schema.format = 'uri';
      if (params.pattern !== undefined) applyPattern(schema, ctx, 'url', params.pattern);
      return schema;
    case 'date':
    case 'time':
    case 'dateTime': {
      const layoutRaw = annotation.name === 'dateTime' ? undefined : params.format;
      const layout = typeof layoutRaw === 'string' ? layoutRaw : 'ISO';
      const isIso = layout === 'ISO' || layout === 'YYYY-MM-DD';
      if (annotation.name === 'date') schema.format = 'date';
      if (annotation.name === 'time') schema.format = 'time';
      if (annotation.name === 'dateTime') schema.format = 'date-time';
      if (!isIso) {
        delete schema.format;
        warnParam(ctx, annotation.name, 'format', `layout '${layout}' is not the RFC 3339 form — needs a derived pattern`);
      }
      applyBoundWarnings(ctx, annotation.name, params);
      return schema;
    }
    case 'nativeDate':
      applyBoundWarnings(ctx, 'nativeDate', params);
      return schema;
    case 'numberFormat': {
      if (params.integer === true) schema.type = 'integer';
      if (params.float === true) warnParam(ctx, 'numberFormat', 'float', "no 'not an integer' keyword");
      if (typeof params.min === 'number') schema.minimum = params.min;
      if (typeof params.max === 'number') schema.maximum = params.max;
      if (typeof params.gt === 'number') schema.exclusiveMinimum = params.gt;
      if (typeof params.lt === 'number') schema.exclusiveMaximum = params.lt;
      if (typeof params.multipleOf === 'number') schema.multipleOf = params.multipleOf;
      return schema;
    }
    case 'bigintFormat': {
      for (const bound of ['min', 'max', 'gt', 'lt', 'multipleOf']) {
        if (params[bound] !== undefined)
          warnParam(ctx, 'bigintFormat', bound, 'numeric bounds not expressible on the string wire form');
      }
      return schema;
    }
    default:
      if (annotation.name.startsWith('temporal')) {
        applyBoundWarnings(ctx, annotation.name, params);
        return schema;
      }
      ctx.warnings.push(`format '${annotation.name}' has no JSON Schema mapping — emitted base type only`);
      return schema;
  }
}

// ────────────────────────────── the walker ──────────────────────────

function temporalSchema(subKind: number, ctx: WalkContext): MutableSchema {
  switch (subKind) {
    case SK.temporalInstant:
      return {type: 'string', format: 'date-time'};
    case SK.temporalPlainDate:
      return {type: 'string', format: 'date'};
    case SK.temporalDuration:
      return {type: 'string', format: 'duration'};
    default:
      // ZonedDateTime ([tz] suffix breaks date-time), PlainTime/PlainDateTime
      // (no offset), PlainYearMonth/PlainMonthDay — pattern territory; the
      // prototype emits the base string and says so.
      ctx.warnings.push('temporal type has no registered 2020-12 format (offset/suffix rules) — emitted plain string');
      return {type: 'string'};
  }
}

function paramChildBySubKind(node: RunType, subKind: number): RunType | undefined {
  // Map/Set carry their key/value/item types as KindParameter wrappers in the
  // `arguments` slot (subKinds mapKey/mapValue/setItem) — verified on the live graph.
  const slots = [
    ...((node.arguments as RunType[] | undefined) ?? []),
    ...(node.parameters ?? []),
    ...(node.typeArguments ?? []),
    ...(node.children ?? []),
  ];
  for (const slot of slots) {
    if (subKindOf(slot) === subKind) return slot.child ?? slot;
  }
  return undefined;
}

function mapSetSchema(node: RunType, ctx: WalkContext): MutableSchema {
  const isMap = subKindOf(node) === SK.map;
  const label = isMap ? 'Map' : 'Set';
  if (ctx.options.mapSet === 'error') {
    fail(`${label} has no canonical JSON Schema form (pass {mapSet: 'wire'} to emit the RunTypes wire shape)`);
  }
  if (isMap) {
    const key = paramChildBySubKind(node, SK.mapKey);
    const value = paramChildBySubKind(node, SK.mapValue);
    if (!key || !value) fail('Map node without key/value parameter slots');
    return {
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [walkOrThrow(key, ctx, 'Map key'), walkOrThrow(value, ctx, 'Map value')],
        items: false,
        minItems: 2,
      },
    };
  }
  const item = paramChildBySubKind(node, SK.setItem);
  if (!item) fail('Set node without item parameter slot');
  return {type: 'array', items: walkOrThrow(item, ctx, 'Set item'), uniqueItems: true};
}

function literalSchema(node: RunType): MutableSchema {
  const literal = node.literal;
  // bigint literals ride the wire as digit strings (the JSON family's form).
  if (typeof literal === 'bigint') return {const: (literal as bigint).toString()};
  return {const: literal as string | number | boolean | null};
}

function propertyName(member: RunType): string {
  return String(member.name);
}

function objectSchema(node: RunType, ctx: WalkContext): MutableSchema {
  const properties: Record<string, JsonSchemaOut> = {};
  const required: string[] = [];
  let additional: JsonSchemaOut | undefined;
  const patternProperties: Record<string, JsonSchemaOut> = {};
  for (const member of node.children ?? []) {
    const memberKind = kindOf(member);
    if (memberKind === K.property || memberKind === K.propertySignature) {
      const name = propertyName(member);
      if ((member.flags as string[] | undefined)?.includes('symbol')) {
        ctx.warnings.push(`property '${name}' is symbol-keyed — dropped (JSON object keys are strings)`);
        continue;
      }
      const child = member.child;
      if (!child) continue;
      const childSchema = walkMember(child, ctx, name);
      if (childSchema === DROP) continue;
      const schema = childSchema as MutableSchema;
      if (member.readonly === true && typeof schema === 'object') schema.readOnly = true;
      properties[name] = schema;
      // `optional` covers `?:`; nonEnumerable is wire-may-omit; a `T | undefined`
      // union child was flagged by walkMember via ctx (undefinedAbsorbed).
      const optional = member.optional === true || member.nonEnumerable === true || absorbedUndefined.has(child);
      if (!optional) required.push(name);
    } else if (memberKind === K.indexSignature) {
      const key = member.index;
      const value = member.child;
      if (!key || !value) continue;
      const keyKind = kindOf(key);
      const valueSchema = walkOrThrow(value, ctx, 'index-signature value');
      if (keyKind === K.number) patternProperties['^(?:0|[1-9][0-9]*)$'] = valueSchema;
      else if (keyKind === K.string) additional = valueSchema;
      else ctx.warnings.push('index signature with non-string/number key — dropped in prototype');
    } else if (memberKind === K.method || memberKind === K.methodSignature) {
      ctx.warnings.push(`method '${propertyName(member)}' is not data — dropped`);
    } else if (memberKind === K.callSignature) {
      ctx.warnings.push('callable interface: call signature is not data — emitted data properties only');
    }
  }
  const schema: MutableSchema = {type: 'object'};
  if (Object.keys(properties).length > 0) schema.properties = properties;
  if (required.length > 0) schema.required = required;
  if (additional !== undefined) schema.additionalProperties = additional;
  if (Object.keys(patternProperties).length > 0) schema.patternProperties = patternProperties;
  if (typeof node.typeName === 'string' && node.typeName !== '') schema.title = node.typeName;
  return schema;
}

function tupleSchema(node: RunType, ctx: WalkContext): MutableSchema {
  const prefixItems: JsonSchemaOut[] = [];
  let rest: JsonSchemaOut | undefined;
  let firstOptional = -1;
  const members = node.children ?? [];
  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const child = member.child ?? member;
    // A rest member is a tupleMember flagged 'rest' whose child is the ELEMENT
    // type (verified on the live graph); kind rest nodes are handled too.
    const isRest = (member.flags as string[] | undefined)?.includes('rest') === true;
    if (isRest || kindOf(member) === K.rest || kindOf(child) === K.rest) {
      const restNode = kindOf(child) === K.rest ? child : member;
      rest = walkOrThrow(restNode.child ?? restNode, ctx, 'tuple rest element');
      continue;
    }
    if (member.optional === true && firstOptional === -1) firstOptional = prefixItems.length;
    prefixItems.push(walkOrThrow(child, ctx, `tuple member ${i}`));
  }
  const schema: MutableSchema = {type: 'array', prefixItems};
  schema.minItems = firstOptional === -1 ? prefixItems.length : firstOptional;
  if (rest !== undefined) schema.items = rest;
  else {
    schema.items = false;
    schema.maxItems = prefixItems.length;
  }
  return schema;
}

// Tracks union children that carried (and absorbed) an `undefined` member at a
// property position, so objectSchema treats the property as optional.
const absorbedUndefined = new WeakSet<RunType>();

function unionSchema(node: RunType, ctx: WalkContext, atProperty: boolean): JsonSchemaOut | typeof DROP {
  const members = (node.children ?? []) as RunType[];
  const kept: JsonSchemaOut[] = [];
  let sawUndefined = false;
  for (const member of members) {
    const memberKind = kindOf(member);
    if (memberKind === K.undefined || memberKind === K.void) {
      sawUndefined = true;
      continue;
    }
    if (isNonData(member)) {
      ctx.warnings.push('union member is not data — dropped from anyOf (matches the validator families)');
      continue;
    }
    kept.push(walkOrThrow(member, ctx, 'union member'));
  }
  if (sawUndefined && atProperty) absorbedUndefined.add(node);
  if (sawUndefined && !atProperty)
    ctx.warnings.push("union contains 'undefined' outside a property — JSON cannot carry it, member dropped");
  if (kept.length === 0) {
    if (atProperty) return DROP;
    fail('union has no JSON-representable members');
  }
  if (kept.length === 1) return kept[0];
  return {anyOf: kept};
}

function walkOrThrow(node: RunType, ctx: WalkContext, position: string): JsonSchemaOut {
  const schema = walk(node, ctx, false);
  if (schema === DROP) fail(`type at ${position} has no JSON representation (non-data kind at a propagating position)`);
  return schema;
}

// walkMember: property position — non-data children DROP (with warning).
function walkMember(node: RunType, ctx: WalkContext, name: string): JsonSchemaOut | typeof DROP {
  if (isNonData(node)) {
    ctx.warnings.push(`property '${name}' is not data — dropped (DataOnly projection)`);
    return DROP;
  }
  return walk(node, ctx, true);
}

function walk(node: RunType, ctx: WalkContext, atProperty: boolean): JsonSchemaOut | typeof DROP {
  // Circular nodes go through $defs — JSON Schema's only recursion mechanism.
  const nodeId = String(node.id);
  if (node.isCircular === true) {
    if (!ctx.defs.has(nodeId)) {
      ctx.defs.set(nodeId, null); // reserve before walking the body
      ctx.defs.set(nodeId, walkBody(node, ctx, atProperty) as JsonSchemaOut);
    }
    return {$ref: `#/$defs/${nodeId}`};
  }
  if (ctx.stack.includes(node)) fail(`unexpected cycle at '${nodeId}' without isCircular flag`);
  ctx.stack.push(node);
  try {
    return walkBody(node, ctx, atProperty);
  } finally {
    ctx.stack.pop();
  }
}

function walkBody(node: RunType, ctx: WalkContext, atProperty: boolean): JsonSchemaOut | typeof DROP {
  const annotation = node.formatAnnotation;
  const withFormat = (base: MutableSchema): MutableSchema => (annotation ? applyFormat(base, annotation, ctx) : base);
  switch (kindOf(node)) {
    case K.any:
    case K.unknown:
      return true;
    case K.string:
    case K.templateLiteral: {
      if (kindOf(node) === K.templateLiteral) {
        ctx.warnings.push(
          'template literal: derived regex not composed in the prototype (the Go validate emitter already builds it) — emitted plain string'
        );
        return {type: 'string'};
      }
      return withFormat({type: 'string'});
    }
    case K.number:
      return withFormat({type: 'number'});
    case K.boolean:
      return {type: 'boolean'};
    case K.bigint:
      // Wire projection: the JSON family serializes bigint via toString().
      return withFormat({type: 'string', pattern: BIGINT_WIRE_PATTERN});
    case K.null:
      return {type: 'null'};
    case K.undefined:
    case K.void:
      if (atProperty) return DROP;
      fail("'undefined'/'void' has no JSON representation outside a property position");
    case K.object:
      // The broad `object` kind: `typeof v === 'object'` also admits arrays.
      return {type: ['object', 'array']};
    case K.literal:
      return literalSchema(node);
    case K.enum:
      return {enum: [...((node.values as unknown[] | undefined) ?? [])]};
    case K.array:
      return {type: 'array', items: node.child ? walkOrThrow(node.child, ctx, 'array element') : true};
    case K.tuple:
      return tupleSchema(node, ctx);
    case K.union:
      return unionSchema(node, ctx, atProperty);
    case K.intersection: {
      const members = (node.children ?? []).map((member) => walkOrThrow(member, ctx, 'intersection member'));
      return {allOf: members};
    }
    case K.objectLiteral:
      return objectSchema(node, ctx);
    case K.class: {
      const subKind = subKindOf(node);
      if (subKind === SK.date) return withFormat({type: 'string', format: 'date-time'});
      if (subKind === SK.map || subKind === SK.set) return mapSetSchema(node, ctx);
      if (subKind === SK.nonSerializable) {
        if (atProperty) return DROP;
        fail('non-serializable native class has no JSON representation');
      }
      if (subKind >= SK.temporalInstant && subKind <= SK.temporalDuration) return withFormat(temporalSchema(subKind, ctx));
      return objectSchema(node, ctx); // plain user class — structural data shape
    }
    case K.promise:
    case K.never:
    case K.symbol:
    case K.function:
    case K.method:
    case K.methodSignature:
    case K.callSignature:
    case K.regexp:
      if (atProperty) return DROP;
      fail(`kind ${kindOf(node)} is not data — no JSON representation at a propagating position`);
    default:
      fail(`unhandled RunTypeKind ${kindOf(node)} (prototype scope)`);
  }
}

/** Emit the draft 2020-12 JSON Schema for a reflected RunType graph — the wire
 *  projection of `T` (what `createJsonEncoderFn<T>` produces / the decoder
 *  accepts as parsed JSON). Returns the schema plus the Warning list (expected
 *  drops); throws on kinds that would make the schema lie (Error severity). **/
export function runTypeToJsonSchema(root: RunType, options?: RunTypeToJsonSchemaOptions): JsonSchemaResult {
  const ctx: WalkContext = {
    options: {mapSet: options?.mapSet ?? 'error'},
    warnings: [],
    defs: new Map(),
    stack: [],
  };
  const body = walk(root, ctx, false);
  if (body === DROP) fail('root type has no JSON representation');
  const schema: MutableSchema = {$schema: 'https://json-schema.org/draft/2020-12/schema'};
  if (options?.id !== undefined) schema.$id = options.id;
  const bodyObject: MutableSchema = body === true ? {} : (body as MutableSchema);
  Object.assign(schema, bodyObject);
  if (ctx.defs.size > 0) {
    schema.$defs = Object.fromEntries([...ctx.defs.entries()]);
  }
  return {schema, warnings: ctx.warnings};
}
