// Random BUILDER-SCHEMA generator for the elision form-equivalence lane.
//
// Like core/runTypeGen.ts this is DELIBERATELY NARROW: it covers the shapes
// the value-first builders spell naturally over JSON-pure data (object / array
// / union-of-literals over string / integer / boolean / literal, with optional
// props), because the lane's subject is the two SPELLINGS of a schema — the
// static `InferType<typeof rt>` form vs the value form — not type-space
// breadth (the `types` lane owns that). JSON-pure values keep the round-trip
// oracle a plain JSON.stringify comparison: no Date, no bigint, no floats
// (integer-only sidesteps -0), no NaN.
//
// Draws from the global Math.random — wrap a run in `withSeededRandom(seed,
// …)` (core/seededRng.ts) to replay it byte-for-byte.

export type Shape =
  | {kind: 'string'}
  | {kind: 'number'}
  | {kind: 'boolean'}
  | {kind: 'literal'; value: string}
  | {kind: 'object'; props: {name: string; optional: boolean; shape: Shape}[]}
  | {kind: 'array'; item: Shape}
  | {kind: 'union'; arms: [string, string]};

export interface BuilderGenOptions {
  /** Emit only leaves at or beyond this nesting depth (bounds the tree). **/
  maxDepth: number;
  /** Probability (0..1) of stopping at a leaf below `maxDepth`. **/
  leafBias: number;
}

export const DEFAULT_BUILDER_GEN_OPTIONS: BuilderGenOptions = {maxDepth: 3, leafBias: 0.4};

const rnd = (): number => Math.random();
const upTo = (n: number): number => Math.floor(rnd() * n);
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'kappa', 'sigma', 'theta'];
const word = (): string => WORDS[upTo(WORDS.length)];

export function randomShape(options: BuilderGenOptions = DEFAULT_BUILDER_GEN_OPTIONS, depth = 0): Shape {
  if (depth >= options.maxDepth || rnd() < options.leafBias) {
    switch (upTo(4)) {
      case 0:
        return {kind: 'string'};
      case 1:
        return {kind: 'number'};
      case 2:
        return {kind: 'boolean'};
      default:
        return {kind: 'literal', value: word()};
    }
  }
  switch (upTo(3)) {
    case 0: {
      const count = 1 + upTo(3);
      const props: {name: string; optional: boolean; shape: Shape}[] = [];
      for (let i = 0; i < count; i++) {
        props.push({name: `p${i}${word()}`, optional: rnd() < 0.3, shape: randomShape(options, depth + 1)});
      }
      return {kind: 'object', props};
    }
    case 1:
      return {kind: 'array', item: randomShape(options, depth + 1)};
    default: {
      const first = word();
      let second = word();
      if (second === first) second = `${second}2`;
      return {kind: 'union', arms: [first, second]};
    }
  }
}

/** Render the shape as a value-first builder expression. Builder names match
 *  the fixture's imports (object/array/union/optional/literal from /builders,
 *  string/number/boolean from /builders + /formats — see elisionRunner). **/
export function renderBuilderExpr(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return 'string()';
    case 'number':
      return 'number()';
    case 'boolean':
      return 'boolean()';
    case 'literal':
      return `literal('${shape.value}')`;
    case 'array':
      return `array(${renderBuilderExpr(shape.item)})`;
    case 'union':
      // The union builder takes its members as ONE array argument.
      return `union([literal('${shape.arms[0]}'), literal('${shape.arms[1]}')])`;
    case 'object': {
      const members = shape.props.map((prop) => {
        const inner = renderBuilderExpr(prop.shape);
        return `${prop.name}: ${prop.optional ? `optional(${inner})` : inner}`;
      });
      return `object({${members.join(', ')}})`;
    }
  }
}

/** A conforming value for the shape (JSON-pure by construction). **/
export function validValue(shape: Shape): unknown {
  switch (shape.kind) {
    case 'string':
      return word();
    case 'number':
      return upTo(1000);
    case 'boolean':
      return rnd() < 0.5;
    case 'literal':
      return shape.value;
    case 'array': {
      const length = upTo(3);
      const out: unknown[] = [];
      for (let i = 0; i < length; i++) out.push(validValue(shape.item));
      return out;
    }
    case 'union':
      return shape.arms[upTo(2)];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const prop of shape.props) {
        if (prop.optional && rnd() < 0.4) continue;
        out[prop.name] = validValue(prop.shape);
      }
      return out;
    }
  }
}

/** A value that VIOLATES the shape at the root — the cheapest guaranteed-wrong
 *  probe (every shape in this generator rejects a bare symbol-free object /
 *  mismatched primitive at its root). **/
export function invalidValue(shape: Shape): unknown {
  switch (shape.kind) {
    case 'string':
    case 'literal':
    case 'union':
      return 12345;
    case 'number':
      return 'not-a-number';
    case 'boolean':
      return 'not-a-boolean';
    case 'array':
      return {nope: true};
    case 'object':
      return 42;
  }
}

/** Human title for failure reports. **/
export function describeShape(shape: Shape): string {
  return renderBuilderExpr(shape);
}
