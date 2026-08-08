// Runtime "does this candidate match the negated child?" test used by the
// mock walker's rejection sampling (mockType.ts). The generated VALIDATORS
// never use this — negation is compiled there (`base && !(child)`); this
// mirror exists only because mocking is a runtime interpreter, so it needs a
// runtime answer to the same question.
//
// Bias: where a named format's exact acceptance is expensive to reproduce,
// the tests here are deliberately LOOSE (over-match). An over-match only
// costs a wasted retry; an under-match would let a candidate through that
// the real validator rejects, failing the `validate(mock())` soundness gate.
// Anything this walker cannot honestly test THROWS with the escape hatch
// named — never a silent guess.

import type {RunType} from '../runtypes/types.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import {getRTUtils} from '../runtypes/rtUtils.ts';
import {structuralFormatAccepts} from './structuralFormat.ts';

const MAX_MATCH_DEPTH = 16;

export function negationChildMatches(value: unknown, child: RunType): boolean {
  return matches(value, child, 0);
}

function matches(value: unknown, node: RunType, depth: number): boolean {
  if (depth > MAX_MATCH_DEPTH) throw negationMatchError('recursion exceeded MAX_MATCH_DEPTH');
  const kind = node.kind as number;
  switch (kind) {
    case RunTypeKind.ref: {
      const resolved = getRTUtils().getRunType(node.id as string);
      if (!resolved) throw negationMatchError(`unresolvable ref '${String(node.id)}'`);
      return matches(value, resolved, depth + 1);
    }
    case RunTypeKind.any:
    case RunTypeKind.unknown:
      return true;
    case RunTypeKind.never:
      return false;
    case RunTypeKind.null:
      return value === null;
    case RunTypeKind.undefined:
    case RunTypeKind.void:
      return value === undefined;
    case RunTypeKind.boolean:
      return typeof value === 'boolean';
    case RunTypeKind.string:
      return typeof value === 'string' && formatMatches(value, node.formatAnnotation);
    case RunTypeKind.number:
      return Number.isFinite(value) && numberParamsMatch(value as number, node.formatAnnotation);
    case RunTypeKind.bigint:
      return typeof value === 'bigint' && bigintParamsMatch(value, node.formatAnnotation);
    case RunTypeKind.literal:
      return literalMatches(value, node);
    case RunTypeKind.enum: {
      const values = Array.isArray(node.values) ? node.values : [];
      return values.some((entry) => entry === value);
    }
    case RunTypeKind.object:
      return (
        typeof value === 'object' &&
        value !== null &&
        structuralFormatAccepts(value, node.formatAnnotation) &&
        patternKeysSatisfied(value as Record<string, unknown>, node, depth)
      );
    case RunTypeKind.array:
      if (!Array.isArray(value) || !structuralFormatAccepts(value, node.formatAnnotation)) return false;
      if (!containsSatisfied(value, node, depth)) return false;
      return node.child ? value.every((item) => matches(item, node.child as RunType, depth + 1)) : true;
    case RunTypeKind.tuple: {
      if (!Array.isArray(value)) return false;
      if (!structuralFormatAccepts(value, node.formatAnnotation)) return false;
      if (!containsSatisfied(value, node, depth)) return false;
      const members = node.children ?? [];
      const lastMember = members[members.length - 1];
      const restMember = lastMember !== undefined && restElement(lastMember) !== undefined ? lastMember : undefined;
      const fixed = restMember === undefined ? members : members.slice(0, -1);
      const required = fixed.filter((member) => !member.optional).length;
      if (value.length < required) return false;
      // An OPEN tuple ([A, B, ...rest]) accepts any longer array — only a
      // closed tuple bounds the length. Under-matching here would let the
      // sampler keep candidates the real validator rejects.
      if (restMember === undefined && value.length > fixed.length) return false;
      return value.every((item, i) => {
        if (i < fixed.length) return fixed[i] ? matches(item, memberChild(fixed[i]), depth + 1) : false;
        const element = restElement(restMember as RunType);
        return element === undefined ? true : matches(item, element, depth + 1);
      });
    }
    case RunTypeKind.union: {
      // OneOf (exactly-one) counts BRANCH matches — the tag's branch list,
      // not the flattened members. A branch over-match can flip a true
      // exactly-one to a false here (count 1 → 2); that direction only
      // wastes a retry in the mock loop, and the `validate(mock())` gate
      // still polices the rare oneOf-under-negation path.
      const branches = node.oneOf as RunType[] | undefined;
      if (branches && branches.length > 0) {
        let count = 0;
        for (const branch of branches) if (matches(value, branch, depth + 1)) count++;
        return count === 1;
      }
      return (node.children ?? []).some((arm) => matches(value, arm, depth + 1));
    }
    case RunTypeKind.objectLiteral: {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
      if (!structuralFormatAccepts(value, node.formatAnnotation)) return false;
      if (!patternKeysSatisfied(value as Record<string, unknown>, node, depth)) return false;
      const record = value as Record<string, unknown>;
      for (const member of node.children ?? []) {
        if ((member.kind as number) === RunTypeKind.indexSignature) {
          const valueChild = member.child;
          if (valueChild && !Object.values(record).every((entry) => matches(entry, valueChild, depth + 1))) return false;
          continue;
        }
        const name = member.name as string | undefined;
        if (name === undefined) continue;
        if (!(name in record)) {
          if (member.optional) continue;
          return false;
        }
        if (!matches(record[name], memberChild(member), depth + 1)) return false;
      }
      return true;
    }
    default:
      throw negationMatchError(`cannot test a candidate against child kind ${kind}`);
  }
}

function memberChild(member: RunType): RunType {
  return (member.child as RunType | undefined) ?? member;
}

// Contains assertions, per the loose bias: items are counted through
// matches(), which may over-count — over-counting can flip a verdict either
// way here, but a wrong `true` only costs the sampler a retry, keeping the
// caller sound (candidates the real validator rejects never slip through as
// "not matching the child").
function containsSatisfied(items: readonly unknown[], node: RunType, depth: number): boolean {
  const entries = node.contains;
  if (!entries || entries.length === 0) return true;
  for (const entry of entries) {
    let count = 0;
    for (const item of items) if (matches(item, entry.child, depth + 1)) count++;
    if (count < entry.min) return false;
    if (entry.max >= 0 && count > entry.max) return false;
  }
  return true;
}

// patternProperties / propertyNames, per the loose bias: pattern-matching
// keys probe their value child through matches(); every key probes the
// propertyNames child. Over-matching only costs sampler retries.
function patternKeysSatisfied(record: Record<string, unknown>, node: RunType, depth: number): boolean {
  const patternProps = node.patternProps;
  if (patternProps && patternProps.length > 0) {
    for (const entry of patternProps) {
      for (const [key, entryValue] of Object.entries(record)) {
        if (new RegExp(entry.source).test(key) && !matches(entryValue, entry.value, depth + 1)) return false;
      }
    }
  }
  const propNames = node.propNames;
  if (propNames && propNames.length > 0) {
    for (const entry of propNames) {
      for (const key of Object.keys(record)) {
        if (!matches(key, entry, depth + 1)) return false;
      }
    }
  }
  return true;
}

// The element type of a rest tuple member (`...E[]` → E) across the wire
// spellings: a RunTypeKind.rest node, a tupleMember wrapping one, or a
// tupleMember carrying flags: ['rest'] with the element as its direct child
// (the Go serializer's tuple form). Undefined for non-rest members.
function restElement(member: RunType): RunType | undefined {
  if ((member.kind as number) === RunTypeKind.rest) return member.child as RunType | undefined;
  if (Array.isArray(member.flags) && (member.flags as unknown[]).includes('rest')) return member.child as RunType | undefined;
  const child = member.child as RunType | undefined;
  if (child && (child.kind as number) === RunTypeKind.rest) return child.child as RunType | undefined;
  return undefined;
}

function literalMatches(value: unknown, node: RunType): boolean {
  const literal = node.literal;
  if (Array.isArray(node.flags) && (node.flags as unknown[]).includes('bigint')) {
    return typeof value === 'bigint' && value.toString() === String(literal);
  }
  return value === literal;
}

// ─────────────────────────── format param tests ───────────────────────────

type PatternParam = {source?: unknown; flags?: unknown};

function patternTest(param: unknown, value: string): boolean {
  const pattern = param as PatternParam;
  if (!pattern || typeof pattern.source !== 'string') {
    throw negationMatchError('pattern param without a literal source');
  }
  return new RegExp(pattern.source, typeof pattern.flags === 'string' ? pattern.flags : '').test(value);
}

// Loose named-format tests (see the bias note in the header).
const NAMED_STRING_FORMATS: Record<string, (value: string) => boolean> = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  time: (value) => /^\d{2}:\d{2}(:\d{2})?/.test(value),
  dateTime: (value) => /^\d{4}-\d{2}-\d{2}[Tt ]/.test(value),
  ip: (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(':'),
  domain: (value) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value),
  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
};

function formatMatches(value: string, annotation: FormatAnnotation | undefined): boolean {
  if (!annotation) return true;
  const name = annotation.name;
  const params = annotation.params ?? {};
  if (name === 'stringFormat') return stringParamsMatch(value, params);
  // A registered `pattern` makes the params the ORACLE, not a narrowing extra:
  // every pattern-bearing named family (url / domain / email) compiles to
  // `namedPatternValidate` over exactly these params, so testing them is exact.
  // The loose name test below would then be a DIFFERENT, stricter question and
  // could under-match — `new URL()` rejects the relative references
  // UriReference / IriReference deliberately accept, and the loose `domain`
  // test demands a dot that the single-label HOSTNAME_PATTERN does not.
  if (params.pattern) return stringParamsMatch(value, params);
  const named = NAMED_STRING_FORMATS[name];
  if (!named) throw negationMatchError(`no runtime test for string format '${name}'`);
  // Pattern-less named formats (ip / uuid / idn-hostname / the RFC email pair)
  // carry their check in the emitter, not in params; the loose test over-matches
  // them, which is the safe direction.
  return named(value);
}

function stringParamsMatch(value: string, params: Record<string, unknown>): boolean {
  for (const [key, param] of Object.entries(params)) {
    switch (key) {
      case 'contentMediaType': {
        // Parse the DECODED content when an encoding is declared — testing the
        // raw string would under-match, which is the unsound direction.
        if (param !== 'application/json') break;
        try {
          JSON.parse(params.contentEncoding === 'base64' ? atob(value) : value);
        } catch {
          return false;
        }
        break;
      }
      // `contentEncoding` alone constrains nothing here: the encodings ride a
      // registered RFC 4648 pattern, so the `pattern` arm already tested it.
      case 'contentEncoding':
        break;
      case 'minLength':
        if (typeof param === 'number' && value.length < param) return false;
        break;
      case 'maxLength':
        if (typeof param === 'number' && value.length > param) return false;
        break;
      case 'length':
        if (typeof param === 'number' && value.length !== param) return false;
        break;
      case 'pattern':
        if (!patternTest(param, value)) return false;
        break;
      case 'allowedChars':
        if (!patternTest(param, value)) return false;
        break;
      case 'disallowedChars':
        if (patternTest(param, value)) return false;
        break;
      case 'allowedValues':
        if (Array.isArray(param) && !param.includes(value)) return false;
        break;
      case 'disallowedValues':
        if (Array.isArray(param) && param.includes(value)) return false;
        break;
      // `idna: 'ascii'` adds nothing over the ASCII pattern that rides with it
      // (domain.go only emits an idna check when the params allow unicode), so
      // the pattern arm has already tested it. Any other setting is a check
      // this walker cannot reproduce.
      case 'idna':
        if (param !== 'ascii') throw negationMatchError(`no runtime test for idna '${String(param)}'`);
        break;
      case 'mockSamples':
      case 'not':
        break; // generation-only / handled by the caller
      default:
        throw negationMatchError(`no runtime test for string param '${key}'`);
    }
  }
  return true;
}

function numberParamsMatch(value: number, annotation: FormatAnnotation | undefined): boolean {
  if (!annotation) return true;
  const params = annotation.params ?? {};
  for (const [key, param] of Object.entries(params)) {
    switch (key) {
      case 'min':
        if (typeof param === 'number' && value < param) return false;
        break;
      case 'max':
        if (typeof param === 'number' && value > param) return false;
        break;
      case 'gt':
        if (typeof param === 'number' && value <= param) return false;
        break;
      case 'lt':
        if (typeof param === 'number' && value >= param) return false;
        break;
      case 'integer':
        if (param === true && !Number.isInteger(value)) return false;
        break;
      case 'multipleOf':
        if (typeof param === 'number' && param !== 0 && value % param !== 0) return false;
        break;
      case 'isCurrency':
      case 'mockSamples':
      case 'not':
        break; // presentation / generation-only
      default:
        throw negationMatchError(`no runtime test for number param '${key}'`);
    }
  }
  return true;
}

function bigintParamsMatch(value: bigint, annotation: FormatAnnotation | undefined): boolean {
  if (!annotation) return true;
  const params = annotation.params ?? {};
  for (const [key, param] of Object.entries(params)) {
    switch (key) {
      case 'min':
        if (value < BigInt(param as string | number | bigint)) return false;
        break;
      case 'max':
        if (value > BigInt(param as string | number | bigint)) return false;
        break;
      case 'gt':
        if (value <= BigInt(param as string | number | bigint)) return false;
        break;
      case 'lt':
        if (value >= BigInt(param as string | number | bigint)) return false;
        break;
      case 'multipleOf': {
        const divisor = BigInt(param as string | number | bigint);
        if (divisor !== 0n && value % divisor !== 0n) return false;
        break;
      }
      case 'mockSamples':
      case 'not':
        break;
      default:
        throw negationMatchError(`no runtime test for bigint param '${key}'`);
    }
  }
  return true;
}

function negationMatchError(reason: string): Error {
  return new Error(
    `Cannot mock a negated type (${reason}). Provide a MockData pool for this type (enrich) with values that do not match the negation.`
  );
}

/** True for the rejection-sampling give-up errors (both the exhausted-attempts
 *  throw in mockType and the cannot-test throws above). The union mock walker
 *  uses this to fall through to a sibling arm — a negated union arm can be
 *  provably empty (a schema enum member excluded by a sibling `not`), and
 *  only an ALL-arms failure should surface. **/
export function isNegationMockError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Cannot mock a negated type');
}

// ───────────────────── analytic numeric complements ─────────────────────
// When the base generator keeps producing values that match a negated
// numeric child (e.g. the integer draws of `random.number` against
// `Not<Integer>`), the complement can be CONSTRUCTED from the child's own
// params: just outside each bound, off the integer grid, off the multiple.
// Candidates that fail the parent's own positive format are filtered by the
// caller through `negationChildMatches`-style checks before use.

export function analyticNumericComplement(parent: RunType): unknown[] {
  const isBigInt = (parent.kind as number) === RunTypeKind.bigint;
  const candidates: unknown[] = [];
  for (const raw of parent.negations ?? []) {
    const child = (raw.kind as number) === RunTypeKind.ref ? getRTUtils().getRunType(raw.id as string) : raw;
    const params = child?.formatAnnotation?.params ?? {};
    if (isBigInt) {
      if (typeof params.min === 'number' || typeof params.min === 'string') candidates.push(BigInt(params.min) - 1n);
      if (typeof params.max === 'number' || typeof params.max === 'string') candidates.push(BigInt(params.max) + 1n);
      continue;
    }
    if (typeof params.min === 'number') candidates.push(params.min - 1);
    if (typeof params.max === 'number') candidates.push(params.max + 1);
    if (typeof params.gt === 'number') candidates.push(params.gt);
    if (typeof params.lt === 'number') candidates.push(params.lt);
    if (params.integer === true) candidates.push(0.5, 7.5, -1.5);
    if (typeof params.multipleOf === 'number' && params.multipleOf !== 0) {
      candidates.push(params.multipleOf / 2, params.multipleOf * 1.5);
    }
  }
  // Generic off-grid fallbacks so an empty-params child still gets a shot.
  if (!isBigInt) candidates.push(0.5, -0.5);
  return candidates;
}
