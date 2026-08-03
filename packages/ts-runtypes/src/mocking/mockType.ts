// Runtime mock-value generator. Walks a RunType graph and produces a value
// that passes `validate<T>` for the same `T`. Direct port of the reference mockType.ts.
//
// Unlike other RT families, mocking is NOT compiled per-type — the walker is
// a runtime interpreter over `runTypesCache`.
//
// Termination on cyclic types: `decayOptionsForNesting` divides
// `optionalProbability` and `maxRandomItemsLength` by the re-entry count, and
// `mockRunType` bails out with `undefined` past `maxMockRecursion` (default 10).

import type {MockDataNode, MockOptions, RunTypeMockOptions} from './mockTypes.ts';
import type {RunType} from '../runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../go-generated/runTypeKind.generated.ts';
import type {RunTypeKindValue} from '../go-generated/runTypeKind.generated.ts';
import {getMockingFunction} from './mockRegistry.ts';
import {negationChildMatches, analyticNumericComplement, isNegationMockError} from './negationMatch.ts';
import {canonicalJson, isStructuralFormat, structuralFormatAccepts} from './structuralFormat.ts';
import {getRTUtils} from '../runtypes/rtUtils.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import {stringCharSet} from './constants.mock.ts';
import {mockBoundedNativeDate} from './mockDateTimeBounds.ts';
import {mockTemporal, isTemporalSubKind, temporalBoundsFromAnnotation} from './mockTemporal.ts';

/** Public entry. Tracks descent via `stack`, applies probability/length decay
 *  based on re-entry count (cycle detector via reference identity — the
 *  runTypes cache shares one object per cyclic ref), then dispatches. **/
export function mockRunType(runType: RunType, options: RunTypeMockOptions, stack: RunType[] = []): unknown {
  stack.push(runType);
  try {
    const baseMockOpts = options.mock as MockOptions;
    const nestLevel = countOccurrences(stack, runType);
    if (nestLevel > baseMockOpts.maxMockRecursion) return undefined;
    const decayed = nestLevel > 1 ? decayOptionsForNesting(options, nestLevel) : options;
    let mocked = mockSwitch(runType, decayed, stack);
    // Apply the format value-transform (lowercase / uppercase / capitalize
    // / trim; domain / ip / url lowercasing) so the mock is the canonical
    // formatted value — mockType.ts:48. The transform is the
    // `formatTransform` RT fn compiled for this type; noop when the format
    // declares no transform.
    if (runType.formatAnnotation && mocked !== undefined) {
      const transform = lookupFormatTransform(runType.id);
      if (transform) mocked = transform(mocked);
    }
    return mocked;
  } finally {
    stack.pop();
  }
}

// FORMAT_TRANSFORM_FAMILY is the formatTransform family tag ("fmt", mirrors
// the Go CacheModule tag in internal/constants/constants.go). Compiled
// entries register under `<fmtFnHash>_<typeId>` where the 3-char fnHash folds
// the binary version — the runtime can't reconstruct it, so the lookup goes
// through findRTForType (suffix + familyTag scan) instead of a literal
// prefix. (The old `'fmt_' + id` key never matched anything — mocks silently
// skipped declared case transforms.)
const FORMAT_TRANSFORM_FAMILY = 'fmt';

/** Resolve the compiled formatTransform fn for a type id, or undefined
 *  when the format declares no transform (noop) or no entry exists. **/
function lookupFormatTransform(id: string): ((value: unknown) => unknown) | undefined {
  const entry = getRTUtils().findRTForType(FORMAT_TRANSFORM_FAMILY, id);
  if (!entry || entry.isNoop || !entry.fn) return undefined;
  return entry.fn as (value: unknown) => unknown;
}

/** Count how many times `target` appears in `stack` by reference identity.
 *  Hand-rolled loop avoids `.filter().length` allocation on the hot path. **/
function countOccurrences(stack: RunType[], target: RunType): number {
  let count = 0;
  for (let i = 0; i < stack.length; i++) {
    if (stack[i] === target) count++;
  }
  return count;
}

/** Reduces optional-probability and item-length by nesting depth so cyclic
 *  types bottom out. Returns a shallow copy; inner pools are shared (they
 *  are read-only). Mirrors `getMockOptionsForNestedElements`. **/
function decayOptionsForNesting(options: RunTypeMockOptions, nestLevel: number): RunTypeMockOptions {
  const mOps = options.mock as MockOptions;
  const maxDepth = mOps.maxMockRecursion;
  const divisor = nestLevel;
  const newProv = nestLevel >= maxDepth ? 0 : mOps.optionalProbability / divisor;
  const newMaxLength = nestLevel >= maxDepth ? 0 : Math.round(mOps.maxRandomItemsLength / divisor);
  const next: MockOptions = {
    ...mOps,
    optionalProbability: newProv,
    maxRandomItemsLength: newMaxLength,
  };
  if (mOps.optionalPropertyProbability) {
    // the reference source double-divides (clearly a typo); we port the intent:
    // value / divisor, matching the global `optionalProbability` decay.
    const entries = Object.entries(mOps.optionalPropertyProbability).map(([key, value]) => {
      const decayed = nestLevel > maxDepth ? 0 : value / divisor;
      return [key, decayed] as const;
    });
    next.optionalPropertyProbability = Object.fromEntries(entries);
  }
  if (mOps.arrayLength !== undefined) {
    next.arrayLength = nestLevel >= maxDepth ? 0 : Math.round(mOps.arrayLength / divisor);
  }
  if (mOps.parentObj) next.parentObj = {};
  return {...options, mock: next};
}

// ─────────────────────── MockData node threading ───────────────────────
// The walker carries the "current MockData node" inside the options bag
// (`options.dataNode`), descended by property name (objects) / `rt$items`
// (arrays) at each recursion. Everything below is a strict no-op when no
// data node is present, so behaviour is byte-identical without `data`.

/** Return a copy of `options` with `dataNode` swapped to `next`. Shares the
 *  `mock` slot (read-only on the walk). Returns `options` untouched when the
 *  node is unchanged so the no-data path allocates nothing extra. **/
function withDataNode(options: RunTypeMockOptions, next: MockDataNode | undefined): RunTypeMockOptions {
  if (options.dataNode === next) return options;
  return {...options, dataNode: next};
}

/** Treat a `MockDataNode` value as a child node only when it's a plain object
 *  (pools / ranges are arrays / scalars and never descend). **/
function asDataNode(value: unknown): MockDataNode | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as MockDataNode;
  return undefined;
}

/** Descend the current data node by object-property name. **/
function childDataNodeByName(node: MockDataNode | undefined, name: string | number | undefined): MockDataNode | undefined {
  if (!node || name === undefined) return undefined;
  return asDataNode(node[name as string]);
}

/** Non-empty value pool from the current data node, or undefined. **/
function dataPool(node: MockDataNode | undefined): unknown[] | undefined {
  if (node && Array.isArray(node.pool) && node.pool.length > 0) return node.pool;
  return undefined;
}

/** Resolve the element count for an array node from `rt$length` (a fixed `n` or
 *  a `[min, max]` range), or undefined to fall through to the global option. **/
function dataArrayLength(node: MockDataNode | undefined, random: MockRandom): number | undefined {
  const len = node?.rt$length;
  if (typeof len === 'number') return len;
  if (Array.isArray(len) && len.length === 2) return random.int(len[0], len[1]);
  return undefined;
}

// Bounded rejection sampling for negated types: complements of real-world
// constraints are dense, so a handful of draws converges. A type whose
// candidates keep matching the negation is an authoring problem and must
// surface loudly, not spin.
const NEGATION_MOCK_ATTEMPTS = 32;

/** Dispatch wrapper: negation-bearing nodes (`runType.negations`, the wire
 *  form of the `__rtNot` sentinel) draw from the base generator — enrichment
 *  pools included — and keep the first candidate matching NO negated child,
 *  so `validate(mock())` holds (the compiled validator checks `!(child)`).
 *  A pool whose values all match the negation throws below rather than
 *  shipping unsound mocks. **/
function mockSwitch(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): unknown {
  const negations = runType.negations;
  // Structural format annotations (formattedArray / formattedObject) reject-sample
  // through the same loop: the array case pre-shapes its draws (length
  // clamp, unique-aware fill), so this guard mostly polices tuple / record /
  // bare-object bases where the annotation landed on a non-array node.
  const structural = isStructuralFormat(runType.formatAnnotation) ? runType.formatAnnotation : undefined;
  const hasNegations = !!negations && negations.length > 0;
  if (!hasNegations && !structural) return mockKindSwitch(runType, options, stack);
  for (let attempt = 0; attempt < NEGATION_MOCK_ATTEMPTS; attempt++) {
    // Back half of the attempts: shrink collection draws — short (and empty)
    // arrays dodge negated contains / minItems children that long random
    // arrays keep matching, turning a ~1e-4 exhaustion flake into never.
    const attemptOptions =
      attempt < NEGATION_MOCK_ATTEMPTS / 2
        ? options
        : {...options, mock: {...(options.mock as MockOptions), arrayLength: attempt % 3}};
    const candidate = mockKindSwitch(runType, attemptOptions, stack);
    if (structural && !structuralFormatAccepts(candidate, structural)) continue;
    if (hasNegations && negations.some((child) => negationChildMatches(candidate, child))) continue;
    return candidate;
  }
  if (!hasNegations) {
    throw new Error(
      `Cannot mock a structural format: ${NEGATION_MOCK_ATTEMPTS} candidates all failed the ${String(runType.formatAnnotation?.name)} constraints. ` +
        'Provide a MockData pool for this type (enrich) with values that satisfy them.'
    );
  }
  // Numeric bases: the random generator may sit entirely inside the negated
  // set (integer draws vs ¬Integer); construct complements from the child's
  // own params instead of giving up.
  const kind = runType.kind as number;
  if (kind === RunTypeKind.number || kind === RunTypeKind.bigint) {
    for (const candidate of analyticNumericComplement(runType)) {
      if (kind === RunTypeKind.number && !numberFormatAccepts(candidate, runType)) continue;
      if (!negations.some((child) => negationChildMatches(candidate, child))) return candidate;
    }
  }
  throw new Error(
    `Cannot mock a negated type: ${NEGATION_MOCK_ATTEMPTS} candidates all matched the negated constraint. ` +
      'Provide a MockData pool for this type (enrich) with values that do not match the negation.'
  );
}

/** Positive filter for analytic complement candidates: the candidate must
 *  still satisfy the PARENT's own format params (when the negated node also
 *  carries positive constraints, e.g. a schema-authored
 *  `{type:'number', minimum: 0, not: {multipleOf: 1}}`). **/
function numberFormatAccepts(candidate: unknown, runType: RunType): boolean {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return false;
  const params = runType.formatAnnotation?.params;
  if (!params) return true;
  if (typeof params.min === 'number' && candidate < params.min) return false;
  if (typeof params.max === 'number' && candidate > params.max) return false;
  if (typeof params.gt === 'number' && candidate <= params.gt) return false;
  if (typeof params.lt === 'number' && candidate >= params.lt) return false;
  if (params.integer === true && !Number.isInteger(candidate)) return false;
  if (typeof params.multipleOf === 'number' && params.multipleOf !== 0 && candidate % params.multipleOf !== 0) return false;
  return true;
}

/** Per-kind dispatch. New kinds land here, NOT in helper files — the whole
 *  switch lives in one place. **/
function mockKindSwitch(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): unknown {
  const mOps = options.mock as MockOptions;
  // The generation's shared random source (seeded or native), threaded on the
  // options bag; every draw below goes through it. Falls back to the shared
  // native instance for a mock path that bypassed createMockDataFn (e.g. a test
  // calling mockRunType directly).
  const random = mOps.random ?? nativeMockRandom;
  const kind = runType.kind as number;
  // Current MockData node for this runtype (undefined ⇒ no enrichment, the
  // walker behaves exactly as before). A pool short-circuits the kind default.
  const dataNode = options.dataNode;
  const pool = dataPool(dataNode);
  if (pool) return random.pick(pool);

  // TypeFormat brand: the kind's registered mock fn produces a value
  // satisfying the format (drawing from mockSamples for pattern formats —
  // a regex can't be reversed). Returns undefined to fall through to the
  // kind-default (e.g. an unknown format name).
  if (runType.formatAnnotation) {
    const mockFn = getMockingFunction(kind as RunTypeKindValue);
    if (mockFn) {
      const mocked = mockFn(runType.formatAnnotation, random);
      if (mocked !== undefined) return mocked;
    }
  }

  switch (kind) {
    case RunTypeKind.never:
      throw new Error('Cannot mock never type.');
    case RunTypeKind.any:
    case RunTypeKind.unknown:
      return random.any(mOps.anyValuesList);
    case RunTypeKind.string:
      return random.string(mOps.stringLength ?? random.int(1, mOps.maxRandomStringLength), mOps.stringCharSet || stringCharSet);
    case RunTypeKind.number: {
      // Data-node min/max (numbers only) override the global bounds.
      const min = typeof dataNode?.min === 'number' ? dataNode.min : mOps.minNumber;
      const max = typeof dataNode?.max === 'number' ? dataNode.max : mOps.maxNumber;
      return random.number(min, max);
    }
    case RunTypeKind.boolean:
      return random.boolean();
    case RunTypeKind.bigint:
      return random.bigint(mOps.minNumber, mOps.maxNumber);
    case RunTypeKind.null:
      return null;
    case RunTypeKind.undefined:
      return undefined;
    case RunTypeKind.void:
      return undefined;
    case RunTypeKind.regexp:
      return random.regExp(mOps.regexpList);
    case RunTypeKind.symbol:
      return random.symbol(mOps.symbolName, mOps.symbolLength, mOps.symbolCharSet);
    case RunTypeKind.literal:
      return runType.literal;
    case RunTypeKind.object:
      return random.pick(mOps.objectList);
    case RunTypeKind.enum: {
      const values = runType.values as unknown[];
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Cannot mock enum without values.');
      }
      const index = mOps.enumIndex ?? random.int(0, values.length - 1);
      return values[index];
    }
    case RunTypeKind.enumMember:
      throw new Error('Mock enum member is not supported.');
    case RunTypeKind.class: {
      // Disambiguate via `subKind`. User-defined classes fall through to
      // the objectLiteral builder (validate matches structurally).
      const subKind = runType.subKind as number | undefined;
      if (subKind === RunTypeSubKind.date) {
        // Date<{min,max}> brands a Date with bounds; honor them so the
        // mock re-passes validate. Falls back to the global mock-option range
        // when the type carries no nativeDate format annotation.
        const dateParams = runType.formatAnnotation?.name === 'nativeDate' ? runType.formatAnnotation.params : undefined;
        if (
          dateParams &&
          (dateParams.min !== undefined ||
            dateParams.max !== undefined ||
            dateParams.gt !== undefined ||
            dateParams.lt !== undefined)
        ) {
          return mockBoundedNativeDate(
            {
              min: dateParams.min as string | undefined,
              max: dateParams.max as string | undefined,
              gt: dateParams.gt as string | undefined,
              lt: dateParams.lt as string | undefined,
            },
            random
          );
        }
        // Data-node Date min/max override the global range for an unbranded
        // Date. Skipped above for format-bounded dates so the format's own
        // bounds (which validate enforces) are never widened out of range.
        const minDate = dataNode?.min instanceof Date ? dataNode.min : mOps.minDate;
        const maxDate = dataNode?.max instanceof Date ? dataNode.max : mOps.maxDate;
        return random.date(minDate, maxDate);
      }
      // Map/Set MockData is v1-limited (no `rt$keys`/`rt$values` in the DSL — the
      // node projects through the object branch). Clear the data node so a
      // stray parent node never leaks into key/value/element generation.
      if (subKind === RunTypeSubKind.map) return mockMap(runType, withDataNode(options, undefined), stack);
      if (subKind === RunTypeSubKind.set) return mockSet(runType, withDataNode(options, undefined), stack);
      if (isTemporalSubKind(subKind)) {
        // FormatTemporalX<{min,max,gt,lt}> brands an orderable Temporal type
        // with bounds; honor them so the mock re-passes validate.
        const bounds = temporalBoundsFromAnnotation(runType.formatAnnotation);
        return mockTemporal(subKind as number, bounds, random);
      }
      if (subKind === RunTypeSubKind.nonSerializable) {
        if (mOps.nonDataTypes) return mockNonSerializableNative(runType);
        throw new Error('Mock is disabled for non-serializable types.');
      }
      return buildObjectLiteral(runType, options, stack, mOps);
    }
    case RunTypeKind.array: {
      const child = runType.child as RunType | undefined;
      if (!child) throw new Error('Cannot mock array: child runtype missing.');
      // Data-node `rt$length` (fixed or [min,max]) overrides the global length;
      // `rt$items` is the element node threaded into each child mock.
      let length = dataArrayLength(dataNode, random) ?? mOps.arrayLength ?? random.int(0, mOps.maxRandomItemsLength);
      // formattedArray annotation: clamp the draw into the declared bounds and
      // fill unique-aware, so the mockSwitch rejection loop above converges
      // instead of re-rolling whole arrays.
      const annotation = runType.formatAnnotation;
      const arrayParams =
        annotation?.name === 'formattedArray' ? ((annotation.params ?? {}) as Record<string, unknown>) : undefined;
      if (arrayParams) {
        if (typeof arrayParams.maxItems === 'number' && length > arrayParams.maxItems) length = arrayParams.maxItems;
        if (typeof arrayParams.minItems === 'number' && length < arrayParams.minItems) length = arrayParams.minItems;
      }
      const childOpts = withDataNode(options, asDataNode(dataNode?.rt$items));
      // Contains entries: splice exactly `min` CHILD MOCKS (they validate
      // the child by the mock soundness invariant) among fillers the loose
      // matcher DEFINITIVELY rejects (matches() === false is definitive),
      // so per-entry counts are exact by construction. Contradictions the
      // construction can prove (min > max, or a matched item the element
      // type definitively rejects) throw loudly instead of shipping an
      // unsound mock.
      const containsChecks = (runType.contains ?? []) as {child: RunType; min: number; max: number}[];
      if (containsChecks.length > 0) {
        const matchedByEntry: unknown[][] = [];
        for (const entry of containsChecks) {
          if (entry.max >= 0 && entry.min > entry.max) {
            throw new Error('Cannot mock contains: minContains exceeds maxContains — the schema is provably empty.');
          }
          const entryItems: unknown[] = [];
          for (let n = 0; n < entry.min; n++) {
            const item = mockRunType(entry.child, childOpts, stack);
            if (!negationChildMatches(item, child)) {
              throw new Error(
                'Cannot mock contains: the contains child and the items type are contradictory. ' +
                  'Provide a MockData pool for this type (enrich).'
              );
            }
            entryItems.push(item);
          }
          matchedByEntry.push(entryItems);
        }
        const matched = matchedByEntry.flat();
        const items: unknown[] = [...matched];
        let fillerAttempts = 0;
        while (items.length < Math.max(length, matched.length) && fillerAttempts < 64) {
          fillerAttempts++;
          const filler = mockRunType(child, childOpts, stack);
          if (containsChecks.every((entry) => !negationChildMatches(filler, entry.child))) items.push(filler);
        }
        if (arrayParams?.uniqueItems === true) {
          const seen = new Set<string>();
          const unique = items.filter((item) => {
            const key = canonicalJson(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          // Per-entry survivor count by REFERENCE against that entry's own
          // constructed items — those validate their child by construction,
          // so the count is exact, never the loose matcher's over-estimate.
          containsChecks.forEach((entry, index) => {
            const surviving = matchedByEntry[index].filter((item) => unique.includes(item)).length;
            if (surviving < entry.min) {
              throw new Error(
                'Cannot mock contains with uniqueItems: the contains child cannot produce enough distinct values. ' +
                  'Provide a MockData pool for this type (enrich).'
              );
            }
          });
          return unique;
        }
        return items;
      }
      if (length === 0) return [];
      if (arrayParams?.uniqueItems === true) {
        const seen = new Set<string>();
        const items: unknown[] = [];
        let attempts = 0;
        while (items.length < length && attempts < length * 32) {
          attempts++;
          const item = mockRunType(child, childOpts, stack);
          const key = canonicalJson(item);
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
        const minItems = typeof arrayParams.minItems === 'number' ? arrayParams.minItems : 0;
        if (items.length < minItems) {
          throw new Error(
            `Cannot mock a uniqueItems array: the element type cannot produce ${minItems} distinct values. ` +
              'Provide a MockData pool for this type (enrich) with enough distinct samples.'
          );
        }
        return items;
      }
      const items: unknown[] = [];
      for (let i = 0; i < length; i++) items.push(mockRunType(child, childOpts, stack));
      return items;
    }
    case RunTypeKind.tuple: {
      const children = (runType.children ?? []) as RunType[];
      // Per-element options, indexed to each slot: `tupleOptions` for a plain
      // tuple, `paramsOptions` for a function's parameter tuple. `Parameters<
      // typeof fn>` (and the `parameters(...)` builder) reflect as a tuple, so a
      // function's arguments are mocked here — `paramsOptions[i]` steers param i.
      const perElemOptions = mOps.tupleOptions ?? mOps.paramsOptions;
      // Tuples share one `rt$items` element node (v1 limitation — the DSL has no
      // per-slot tuple nodes). Threaded into every member's options.
      const itemsNode = asDataNode(dataNode?.rt$items);
      const baseOpts = withDataNode(options, itemsNode);
      const params = children.map((member, index) => {
        const childOpts = perElemOptions?.[index] ? mergeChildOptions(baseOpts, perElemOptions[index]) : baseOpts;
        return mockRunType(member, childOpts, stack);
      });
      // Flatten a trailing rest member into the tuple.
      const lastMember = children[children.length - 1];
      const flattened =
        lastMember && isRestTupleMember(lastMember) && Array.isArray(params[params.length - 1])
          ? [...params.slice(0, -1), ...(params[params.length - 1] as unknown[])]
          : params;
      // formattedArray annotation on a tuple base (a prefixItems schema with
      // uniqueItems / maxItems): shape the draw — dedupe first, then cap the
      // length — so the mockSwitch rejection loop converges. A dedupe that
      // starves a REQUIRED slot just fails validate and re-rolls up there.
      const annotation = runType.formatAnnotation;
      let shaped = flattened;
      if (annotation?.name === 'formattedArray') {
        const arrayParams = (annotation.params ?? {}) as Record<string, unknown>;
        if (arrayParams.uniqueItems === true) {
          const seen = new Set<string>();
          shaped = shaped.filter((item) => {
            const key = canonicalJson(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        if (typeof arrayParams.maxItems === 'number' && shaped.length > arrayParams.maxItems) {
          shaped = shaped.slice(0, arrayParams.maxItems);
        }
      }
      // contains over a TUPLE base has no sound generation story (fixed
      // slots cannot be spliced): pass only when the bounds are provably
      // met — min 0 with the loose over-count inside max — else give up
      // loudly rather than ship a maybe-invalid mock.
      const tupleContains = (runType.contains ?? []) as {child: RunType; min: number; max: number}[];
      for (const entry of tupleContains) {
        const overCount = shaped.filter((item) => negationChildMatches(item, entry.child)).length;
        if (entry.min > 0 || (entry.max >= 0 && overCount > entry.max)) {
          throw new Error(
            'Cannot mock contains over a tuple (prefixItems) base. Provide a MockData pool for this type (enrich).'
          );
        }
      }
      return shaped;
    }
    case RunTypeKind.tupleMember:
    case RunTypeKind.parameter: {
      // Both check `optional` before recursing on `child`. Rest members
      // arrive either as a RunTypeKind.rest child or as flags: ['rest']
      // with the ELEMENT type as the direct child (the Go tuple form) —
      // the latter generates its member array here, mirroring the rest case.
      const child = runType.child as RunType | undefined;
      if (!child) return undefined;
      if (Array.isArray(runType.flags) && (runType.flags as unknown[]).includes('rest') && child.kind !== RunTypeKind.rest) {
        const length = random.int(0, mOps.maxRandomItemsLength);
        const items: unknown[] = [];
        for (let i = 0; i < length; i++) items.push(mockRunType(child, options, stack));
        return items;
      }
      if (runType.optional && !isRestTupleMember(runType)) {
        if (random.float() > mOps.optionalProbability) return undefined;
      }
      return mockRunType(child, options, stack);
    }
    case RunTypeKind.rest: {
      const child = runType.child as RunType | undefined;
      if (!child) return [];
      const length = random.int(0, mOps.maxRandomItemsLength);
      const items: unknown[] = [];
      for (let i = 0; i < length; i++) items.push(mockRunType(child, options, stack));
      return items;
    }
    case RunTypeKind.objectLiteral:
    case RunTypeKind.intersection:
      return buildObjectLiteral(runType, options, stack, mOps);
    case RunTypeKind.property:
    case RunTypeKind.propertySignature: {
      const child = runType.child as RunType | undefined;
      if (!child) return undefined;
      const name = runType.name as string | number | undefined;
      const perPropProb = mOps.optionalPropertyProbability;
      const probability =
        perPropProb && name !== undefined && perPropProb[name] !== undefined ? perPropProb[name] : mOps.optionalProbability;
      if (probability < 0 || probability > 1) {
        throw new Error('optionalProbability must be between 0 and 1');
      }
      if (runType.optional && random.float() > probability) return undefined;
      return mockRunType(child, options, stack);
    }
    case RunTypeKind.indexSignature: {
      const child = runType.child as RunType | undefined;
      const keyType = runType.index as RunType | undefined;
      if (!child || !keyType) return {};
      const length = random.int(0, mOps.maxRandomItemsLength);
      const parent: Record<string | number | symbol, unknown> = mOps.parentObj ?? {};
      const keyKind = keyType.kind as number;
      for (let i = 0; i < length; i++) {
        let propName: string | number | symbol;
        switch (keyKind) {
          case RunTypeKind.number:
            propName = i;
            break;
          case RunTypeKind.string:
            propName = `key${i}`;
            break;
          case RunTypeKind.symbol:
            propName = Symbol.for(`key${i}`);
            break;
          case RunTypeKind.templateLiteral: {
            // Retry on collision — narrow patterns like `id-${number}` can repeat.
            const buildKey = (): string => buildTemplateLiteralString(keyType, mOps, random);
            let candidate = buildKey();
            for (let attempt = 0; attempt < 5 && Object.prototype.hasOwnProperty.call(parent, candidate); attempt++) {
              candidate = buildKey();
            }
            propName = candidate;
            break;
          }
          default:
            throw new Error(`Invalid index signature key kind: ${keyKind}`);
        }
        parent[propName as string] = mockRunType(child, options, stack);
      }
      return parent;
    }
    case RunTypeKind.union: {
      // OneOf (exactly-one): draw from the BRANCH list and reject any
      // candidate a second branch also matches — the mock must land in
      // exactly one branch or the generated validator rejects it. Branch
      // rotation + a bounded attempt budget mirror the negation loop;
      // exclusivity can be genuinely unsatisfiable (duplicate branches), so
      // exhaustion throws loudly instead of shipping an invalid mock.
      const oneOfBranches = runType.oneOf as RunType[] | undefined;
      if (oneOfBranches && oneOfBranches.length > 0) {
        // An explicit unionIndex picks the BRANCH (the tuple as written,
        // duplicates and grouping preserved) — the author's pick, no silent
        // fallback: every draw comes from that branch and a pick that can't
        // land exclusively throws.
        const pickedBranch = mOps.unionIndex;
        if (pickedBranch !== undefined && (pickedBranch < 0 || pickedBranch >= oneOfBranches.length)) {
          throw new Error('unionIndex must be between 0 and the number of oneOf branches.');
        }
        // Budget scales with width so rotation reaches EVERY branch even
        // past 32 of them (each branch gets at least four draws).
        const attempts = Math.max(32, oneOfBranches.length * 4);
        for (let attempt = 0; attempt < attempts; attempt++) {
          const branchIndex: number = pickedBranch ?? attempt % oneOfBranches.length;
          let candidate: unknown;
          try {
            candidate = mockRunType(oneOfBranches[branchIndex], options, stack);
          } catch (error) {
            if (!isNegationMockError(error)) throw error;
            continue;
          }
          const exclusive = oneOfBranches.every((other, i) => i === branchIndex || !negationChildMatches(candidate, other));
          if (exclusive) return candidate;
        }
        throw new Error(
          `Cannot mock OneOf: no candidate matched exactly one branch after ${attempts} attempts — the branches overlap too heavily (or are duplicates, which no value can satisfy).`
        );
      }
      const allChildren = (runType.children ?? []) as RunType[];
      // Pick only among the DataOnly-surviving members so the value passes
      // validate<T> (the validator drops stripped members like symbol /
      // function, so a value of a stripped member would be rejected and the
      // serializers couldn't place it). `notSupported` flags the stripped
      // members; fall back to the full list when none survive (an all-stripped
      // union, which throws anyway).
      const survivors = allChildren.filter((member) => !member.notSupported);
      const children = survivors.length > 0 ? survivors : allChildren;
      if (children.length === 0) throw new Error('Cannot mock union with no branches.');
      if (mOps.unionIndex !== undefined && (mOps.unionIndex < 0 || mOps.unionIndex >= children.length)) {
        throw new Error('unionIndex must be between 0 and the number of types in the union.');
      }
      const index = mOps.unionIndex ?? random.int(0, children.length - 1);
      // An explicit unionIndex is the author's pick — no silent fallback.
      if (mOps.unionIndex !== undefined) return mockRunType(children[index], options, stack);
      // A negated arm can be provably empty (a schema enum member excluded
      // by a sibling `not`) and exhaust its rejection sampling. Fall through
      // to the remaining arms; only an all-arms failure surfaces.
      let negationFailure: unknown;
      for (let offset = 0; offset < children.length; offset++) {
        const arm = children[(index + offset) % children.length];
        try {
          return mockRunType(arm, options, stack);
        } catch (error) {
          if (!isNegationMockError(error)) throw error;
          negationFailure = error;
        }
      }
      throw negationFailure;
    }
    case RunTypeKind.templateLiteral:
      return buildTemplateLiteralString(runType, mOps, random);
    case RunTypeKind.promise: {
      const child = runType.child as RunType | undefined;
      const timeOut = mOps.promiseTimeOut || 0;
      const resolveInner = () => (child ? mockRunType(child, options, stack) : undefined);
      return new Promise((resolve, reject) => {
        const finish = () => {
          if (mOps.promiseReject) reject(mOps.promiseReject);
          else resolve(resolveInner());
        };
        if (timeOut > 0) setTimeout(finish, timeOut);
        else finish();
      });
    }
    case RunTypeKind.function:
    case RunTypeKind.callSignature:
    case RunTypeKind.method:
    case RunTypeKind.methodSignature:
      // The mock isn't expected to satisfy `validate<Function>` — function-typed
      // cases are marked `mockTypeExpect: 'skip'` in the test adapter. With
      // nonDataTypes on, emit a real function so the mock carries the non-data
      // value (serializers drop it, validate ignores it).
      return mOps.nonDataTypes ? mockNonDataFunction() : undefined;
    default:
      throw new Error(`Cannot mock runType: kind ${kind} is not yet supported by the mock walker.`);
  }
}

/** Builds a plain object from an objectLiteral / intersection / user-class.
 *  Skips methods; collects index signatures into the same parent. **/
function buildObjectLiteral(
  runType: RunType,
  options: RunTypeMockOptions,
  stack: RunType[],
  mOps: MockOptions
): Record<string | number, unknown> {
  const children = (runType.children ?? []) as RunType[];
  const parent: Record<string | number, unknown> = mOps.parentObj ?? {};
  const dataNode = options.dataNode;
  for (const member of children) {
    const memberKind = member.kind as number;
    if (memberKind === RunTypeKind.method || memberKind === RunTypeKind.methodSignature) {
      // Methods are non-data — skipped unless nonDataTypes asks for them, in
      // which case attach a real function under the member name.
      const methodName = member.name as string | number | undefined;
      if (mOps.nonDataTypes && methodName !== undefined) parent[methodName] = mockNonDataFunction();
      continue;
    }
    if (memberKind === RunTypeKind.indexSignature) {
      const indexed = mockRunType(member, options, stack);
      if (indexed && typeof indexed === 'object') Object.assign(parent, indexed);
      continue;
    }
    const name = member.name as string | number | undefined;
    if (name === undefined) continue;
    // Descend the data node by property name; the property/propertySignature
    // arm threads these options through to the member's child value.
    const memberOpts = withDataNode(options, childDataNodeByName(dataNode, name));
    const value = mockRunType(member, memberOpts, stack);
    parent[name] = value;
  }
  // formattedObject annotation (minProperties / maxProperties): shape the draw
  // into the declared key-count bounds — record mocks deal out dozens of
  // index keys, so pure rejection sampling in mockSwitch cannot converge.
  // Undeclared (index-signature) keys trim first; top-up draws more index
  // batches. Shapes the loop cannot fix (a closed literal below its
  // minProperties) fall back to the rejection loop's loud give-up.
  const annotation = runType.formatAnnotation;
  if (annotation?.name === 'formattedObject') {
    const params = (annotation.params ?? {}) as Record<string, unknown>;
    const declared = new Set<string | number>();
    let indexMember: RunType | undefined;
    for (const member of children) {
      if ((member.kind as number) === RunTypeKind.indexSignature) indexMember = member;
      const name = member.name as string | number | undefined;
      if (name !== undefined) declared.add(name);
    }
    if (typeof params.maxProperties === 'number') {
      for (const key of Object.keys(parent)) {
        if (Object.keys(parent).length <= params.maxProperties) break;
        if (!declared.has(key)) delete parent[key];
      }
    }
    if (typeof params.minProperties === 'number' && indexMember) {
      let attempts = 0;
      while (Object.keys(parent).length < params.minProperties && attempts < 32) {
        attempts++;
        const indexed = mockRunType(indexMember, options, stack);
        if (indexed && typeof indexed === 'object') Object.assign(parent, indexed);
      }
      if (typeof params.maxProperties === 'number') {
        for (const key of Object.keys(parent)) {
          if (Object.keys(parent).length <= params.maxProperties) break;
          if (!declared.has(key)) delete parent[key];
        }
      }
    }
  }
  // patternProperties: values under pattern-matching keys regenerate from
  // the pattern's own value child (sound by construction); one extra key
  // per pattern is drawn from the pattern-branded key child so its sample
  // pool gets exercised. propertyNames: undeclared keys that definitively
  // fail the child re-key from the child's own mock (a string by
  // construction), or drop.
  const patternProps = (runType.patternProps ?? []) as {source: string; key?: RunType; value: RunType}[];
  if (patternProps.length > 0) {
    const regexes = patternProps.map((entry) => new RegExp(entry.source));
    for (const key of Object.keys(parent)) {
      const matching = patternProps.filter((_entry, index) => regexes[index].test(key));
      // One matching pattern: regenerate the value from ITS child (sound by
      // construction). Overlapping patterns need a value satisfying ALL —
      // no sound single-child generation, so the key drops instead.
      if (matching.length === 1) parent[key] = mockRunType(matching[0].value, options, stack);
      else if (matching.length > 1) delete parent[key];
    }
    patternProps.forEach((entry, index) => {
      if (!entry.key) return;
      const generated = mockRunType(entry.key, options, stack);
      if (typeof generated === 'string' && regexes[index].test(generated) && !(generated in parent)) {
        const others = patternProps.some((_other, otherIndex) => otherIndex !== index && regexes[otherIndex].test(generated));
        if (!others) parent[generated] = mockRunType(entry.value, options, stack);
      }
    });
  }
  const propNames = runType.propNames as RunType | undefined;
  if (propNames) {
    const declaredNames = new Set<string | number>();
    for (const member of children) {
      const name = member.name as string | number | undefined;
      if (name !== undefined) declaredNames.add(name);
    }
    // Undeclared keys re-key unconditionally from the child's own mock —
    // it satisfies the real validator by the soundness invariant, while
    // keeping a random key would lean on the loose matcher. Declared keys
    // stay (a schema whose declared names fail propertyNames is
    // contradictory and surfaces through the rejection loop).
    for (const key of Object.keys(parent)) {
      if (declaredNames.has(key)) continue;
      const entryValue = parent[key];
      delete parent[key];
      for (let attempt = 0; attempt < 8; attempt++) {
        const renamed = mockRunType(propNames, options, stack);
        if (typeof renamed === 'string' && !(renamed in parent)) {
          parent[renamed] = entryValue;
          break;
        }
      }
    }
  }
  return parent;
}

/** A mock value for a function-typed position when nonDataTypes is on. The
 *  serializers drop it and validate ignores it; it exists only so the mock can
 *  carry the non-data member. **/
function mockNonDataFunction(): () => undefined {
  return () => undefined;
}

/** A mock instance for a non-serialisable native (`ArrayBuffer` /
 *  `SharedArrayBuffer` / `DataView` / typed array) when nonDataTypes is on.
 *  Picks the constructor from the class name, defaulting to a small Uint8Array.
 *  These values are always dropped or rejected by the serializers, so the exact
 *  instance only needs to be of the right family. **/
function mockNonSerializableNative(runType: RunType): unknown {
  const className =
    typeof runType.typeName === 'string' ? runType.typeName : typeof runType.name === 'string' ? runType.name : '';
  switch (className) {
    case 'ArrayBuffer':
      return new ArrayBuffer(8);
    case 'SharedArrayBuffer':
      return typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(8) : new ArrayBuffer(8);
    case 'DataView':
      return new DataView(new ArrayBuffer(8));
    case 'Int8Array':
      return new Int8Array([1, 2, 3]);
    case 'Int32Array':
      return new Int32Array([1, 2, 3]);
    case 'Float64Array':
      return new Float64Array([1.5, 2.5]);
    default:
      return new Uint8Array([1, 2, 3]);
  }
}

/** True iff `member` is a tuple/parameter wrapper around RunTypeKind.rest. **/
function isRestTupleMember(member: RunType): boolean {
  if (member.kind === RunTypeKind.rest) return true;
  if (Array.isArray(member.flags) && (member.flags as unknown[]).includes('rest')) return true;
  const child = member.child as RunType | undefined;
  return child !== undefined && child.kind === RunTypeKind.rest;
}

/** Wrap per-element `MockOptions` into the bag shape `mockRunType` expects.
 *  The element options replace the mock bag, so carry the seeded random source
 *  over when they omit it — otherwise a `{seed}` + `tupleOptions`/`paramsOptions`
 *  mock would lose determinism for the overridden slots. **/
function mergeChildOptions(options: RunTypeMockOptions, childMock: MockOptions): RunTypeMockOptions {
  const parentMock = options.mock as MockOptions;
  return {...options, mock: {...childMock, random: childMock.random ?? parentMock.random}};
}

/** Map mock builder. Key/value types live at `runType.arguments[i].child`
 *  (the wire stores them as KindParameter wrappers). **/
function mockMap(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): Map<unknown, unknown> {
  const mOps = options.mock as MockOptions;
  const random = mOps.random ?? nativeMockRandom;
  const args = (runType.arguments ?? []) as RunType[];
  const keyType = args[0]?.child as RunType | undefined;
  const valueType = args[1]?.child as RunType | undefined;
  const result = new Map<unknown, unknown>();
  if (!keyType || !valueType) return result;
  const length = mOps.arrayLength ?? random.int(0, mOps.maxRandomItemsLength);
  for (let i = 0; i < length; i++) {
    const key = mockRunType(keyType, options, stack);
    const value = mockRunType(valueType, options, stack);
    result.set(key, value);
  }
  return result;
}

/** Set mock builder. Element type lives at `runType.arguments[0].child`. **/
function mockSet(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): Set<unknown> {
  const mOps = options.mock as MockOptions;
  const random = mOps.random ?? nativeMockRandom;
  const args = (runType.arguments ?? []) as RunType[];
  const elementType = args[0]?.child as RunType | undefined;
  const result = new Set<unknown>();
  if (!elementType) return result;
  const length = mOps.arrayLength ?? random.int(0, mOps.maxRandomItemsLength);
  for (let i = 0; i < length; i++) result.add(mockRunType(elementType, options, stack));
  return result;
}

/** Render a template-literal runtype to a string satisfying its regex.
 *  Layout: `runType.literal.templateLiteral.{texts, placeholders}`. **/
function buildTemplateLiteralString(runType: RunType, mOps: MockOptions, random: MockRandom): string {
  const envelope = (runType.literal ?? null) as TemplateLiteralEnvelope | null;
  const layout = envelope?.templateLiteral;
  if (!layout || !Array.isArray(layout.texts)) return '';
  const texts = layout.texts;
  const placeholders = Array.isArray(layout.placeholders) ? layout.placeholders : [];
  let out = '';
  for (let i = 0; i < texts.length; i++) {
    out += texts[i];
    if (i < placeholders.length) {
      out += renderTemplateLiteralPlaceholder(placeholders[i], mOps, random);
    }
  }
  return out;
}

interface TemplateLiteralEnvelope {
  templateLiteral?: {
    texts?: string[];
    placeholders?: TemplateLiteralPlaceholder[];
  };
}

interface TemplateLiteralPlaceholder {
  kind?: number;
  literal?: unknown;
}

/** Render one placeholder span to a fragment satisfying the regex anchor. **/
function renderTemplateLiteralPlaceholder(span: TemplateLiteralPlaceholder, mOps: MockOptions, random: MockRandom): string {
  if (!span) return '';
  const kind = typeof span.kind === 'number' ? span.kind : -1;
  switch (kind) {
    case RunTypeKind.literal:
      return span.literal === undefined ? '' : String(span.literal);
    case RunTypeKind.number:
      return String(random.number(mOps.minNumber, mOps.maxNumber));
    case RunTypeKind.bigint:
      return String(random.bigint(mOps.minNumber, mOps.maxNumber));
    case RunTypeKind.string:
    case RunTypeKind.any:
    case RunTypeKind.unknown:
      return random.string(mOps.stringLength ?? random.int(1, mOps.maxRandomStringLength), mOps.stringCharSet || stringCharSet);
    default:
      // Unknown kind — empty string so surrounding text segments still anchor.
      return '';
  }
}
