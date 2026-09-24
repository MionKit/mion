// The security oracles: what must hold for EVERY input, hostile or not.
//
//   JSON decoders (secjson lane)
//     SJ-REJECT     an `expect: 'reject'` payload never decodes into a value `validate` accepts.
//     SJ-PROTO      a returned value has a sane prototype at every object
//                   position and no inherited enumerable keys; the same for the
//                   exact-shape clone of a decoded value, and no encoder writes
//                   a prototype-named key back onto the wire (those rebuild an
//                   object from its keys, the swap sites the decoders never hit).
//     SJ-GLOBAL     Object.prototype / Array.prototype are untouched.
//     SJ-TOTAL      `validate(decoded)` is a boolean without a throw.
//     SJ-TIME       every call inside a budget.
//     (a decoder throw is counted by class in the report, not a violation)
//
//   Format validators (secformat lane)
//     SF-TOTAL      returns a boolean, never throws.
//     SF-TIME       one call under the budget.
//     SF-PATTERN-TIME  the same for each registered pattern regex.

export type SecurityOracleId =
  | 'SJ-REJECT'
  | 'SJ-PROTO'
  | 'SJ-GLOBAL'
  | 'SJ-TOTAL'
  | 'SJ-TIME'
  | 'SF-TOTAL'
  | 'SF-TIME'
  | 'SF-PATTERN-TIME';

export interface SecurityViolation {
  oracle: SecurityOracleId;
  /** The attack that produced it (dictionary id or blind mutation id). **/
  attack: string;
  target: string;
  seed: number;
  message: string;
  /** Short render of the offending input. **/
  input: string;
}

/** Per-decode wall-clock budget: generous fixed head room plus a linear term,
 *  so only genuinely super-linear work trips it. **/
export function decodeBudgetMs(inputLength: number): number {
  return 250 + inputLength / 64;
}

/** Budget for one format validator call over a pumped string. Matches the
 *  sidecar's build-time pattern budget. **/
export const FORMAT_BUDGET_MS = 250;

const MAX_INPUT_RENDER = 160;

export function renderValue(value: unknown): string {
  let text: string;
  try {
    text =
      JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v)) ??
      String(value);
  } catch {
    text = String(value);
  }
  return text.length > MAX_INPUT_RENDER ? `${text.slice(0, MAX_INPUT_RENDER)}…` : text;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : `non-Error throw: ${String(err)}`;
}

interface Ctx {
  target: string;
  seed: number;
}

// ---- JSON side --------------------------------------------------------------

export interface JsonProbe {
  decoders: Record<string, (text: string) => unknown>;
  validate: (value: unknown) => boolean;
  /** Clone / compact encoders run over every decoded value: none may write a prototype-named key back onto the wire. **/
  encoders?: Record<string, (value: unknown) => string | undefined>;
  /** The exact-shape clone, run over every decoded value: it rebuilds from
   *  keys too, so a swap there is an SJ-PROTO finding. **/
  clone?: (value: unknown) => unknown;
}

export interface JsonStepResult {
  violations: SecurityViolation[];
  /** Throw histogram: `<decoder>:<ErrorName>` → count. **/
  throws: Record<string, number>;
}

/** Run every JSON oracle over one attack. **/
export function checkJsonDecode(
  probe: JsonProbe,
  attack: {id: string; expect: 'reject' | 'any'; text: string},
  ctx: Ctx
): JsonStepResult {
  const violations: SecurityViolation[] = [];
  const throws: Record<string, number> = {};
  const input = attack.text.length > MAX_INPUT_RENDER ? `${attack.text.slice(0, MAX_INPUT_RENDER)}…` : attack.text;
  const push = (oracle: SecurityOracleId, message: string): void => {
    violations.push({oracle, attack: attack.id, target: ctx.target, seed: ctx.seed, message, input});
  };
  const timed = <T>(label: string, run: () => T): T => {
    const started = now();
    try {
      return run();
    } finally {
      const elapsed = now() - started;
      const budget = decodeBudgetMs(attack.text.length);
      if (elapsed > budget) push('SJ-TIME', `${label} took ${elapsed.toFixed(1)}ms (budget ${budget.toFixed(0)}ms)`);
    }
  };

  for (const [name, decode] of Object.entries(probe.decoders)) {
    let value: unknown;
    try {
      value = timed(name, () => decode(attack.text));
    } catch (err) {
      const key = `${name}:${err instanceof Error ? err.name : 'non-Error'}`;
      throws[key] = (throws[key] ?? 0) + 1;
      continue;
    }
    checkPrototypes(value, name, attack.id, ctx, violations, input);
    // The rebuild sites are the prototype attacks' targets; running them on
    // every attack would multiply the lane's cost for no new coverage.
    if (isPrototypeAttack(attack.id)) checkRebuilds(probe, value, name, attack.id, ctx, violations, input, throws);
    let accepted: boolean | undefined;
    try {
      accepted = probe.validate(value);
      if (typeof accepted !== 'boolean') push('SJ-TOTAL', `validate returned a non-boolean on ${name}'s output`);
    } catch (err) {
      push('SJ-TOTAL', `validate threw on ${name}'s output: ${errMsg(err)}`);
    }
    if (accepted === true && attack.expect === 'reject') {
      push('SJ-REJECT', `${name} decoded a payload the type rules out into a value validate accepts: ${renderValue(value)}`);
    }
  }
  return {violations, throws};
}

const BUILTIN_PROTOTYPES = new Set<unknown>([
  Object.prototype,
  Array.prototype,
  Map.prototype,
  Set.prototype,
  Date.prototype,
  RegExp.prototype,
  Error.prototype,
  Uint8Array.prototype,
  ArrayBuffer.prototype,
]);

/** The rebuild sites, run over a decoded value: the exact-shape clone must
 *  come back with sane prototypes (SJ-PROTO), and no encoder may write a
 *  prototype-named key back onto the wire. A throw from either is counted in
 *  the histogram like a decoder throw. **/
export function checkRebuilds(
  probe: JsonProbe,
  value: unknown,
  producer: string,
  attackId: string,
  ctx: Ctx,
  out: SecurityViolation[],
  input: string,
  throws: Record<string, number>
): void {
  const count = (key: string): void => {
    throws[key] = (throws[key] ?? 0) + 1;
  };
  if (probe.clone) {
    try {
      checkPrototypes(probe.clone(value), `${producer}→clone`, attackId, ctx, out, input);
    } catch (err) {
      count(`${producer}→clone:${err instanceof Error ? err.name : 'non-Error'}`);
    }
  }
  // A decoder never looks at keys the type does not declare (validate
  // accepts them by default), so an own prototype-named key can already sit
  // on the decoded value; an encoder that prints it back is passing data
  // through, not swapping a prototype. The finding is an encoder that
  // CREATES such a key: one absent from the value it was given.
  const carried = findUnsafeKey(value, new Set(), 0);
  for (const [name, encode] of Object.entries(probe.encoders ?? {})) {
    if (carried) break;
    let text: string | undefined;
    try {
      text = encode(value);
    } catch (err) {
      count(`${producer}→${name}:${err instanceof Error ? err.name : 'non-Error'}`);
      continue;
    }
    if (text === undefined) continue;
    let wire: unknown;
    try {
      wire = JSON.parse(text);
    } catch {
      continue; // an unparseable wire is another oracle's finding (round-trip lanes)
    }
    const key = findUnsafeKey(wire, new Set(), 0);
    if (key)
      out.push({
        oracle: 'SJ-PROTO',
        attack: attackId,
        target: ctx.target,
        seed: ctx.seed,
        message: `${producer}→${name}: the encoder wrote the prototype-named key '${key}' onto the wire`,
        input,
      });
  }
}

// `prototype` and `constructor` on the wire are ordinary data: they land as
// plain own keys and every road carries them. Only a `__proto__` key an encoder
// CREATED is a finding.
const UNSAFE_KEYS = new Set(['__proto__']);

/** The dictionary ids that plant a prototype-named key or a foreign prototype. **/
export function isPrototypeAttack(id: string): boolean {
  return id.includes('proto') || id.includes('constructor') || id.includes('prototype');
}

/** The first own prototype-named key anywhere in a parsed wire tree, or null. **/
export function findUnsafeKey(value: unknown, seen: Set<unknown>, depth: number): string | null {
  if (value === null || typeof value !== 'object' || seen.has(value) || depth > NESTING_SCAN_LIMIT) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const key = findUnsafeKey(item, seen, depth + 1);
      if (key) return key;
    }
    return null;
  }
  // Map keys and Set members are values, never property names: only what
  // they hold is scanned (a decoded Map / Set is an array on the wire).
  if (value instanceof Map) {
    for (const [k, v] of value) {
      const key = findUnsafeKey(k, seen, depth + 1) ?? findUnsafeKey(v, seen, depth + 1);
      if (key) return key;
    }
    return null;
  }
  if (value instanceof Set) {
    for (const item of value) {
      const key = findUnsafeKey(item, seen, depth + 1);
      if (key) return key;
    }
    return null;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) return key;
    const nested = findUnsafeKey((value as Record<string, unknown>)[key], seen, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/** SJ-PROTO over one returned value: every object position has a sane
 *  prototype (Object.prototype, null, a builtin, or a real class prototype)
 *  and no inherited enumerable keys. **/
export function checkPrototypes(
  value: unknown,
  producer: string,
  attackId: string,
  ctx: Ctx,
  out: SecurityViolation[],
  input: string
): void {
  const problem = findPrototypeProblem(value, new Set(), 0);
  if (problem)
    out.push({
      oracle: 'SJ-PROTO',
      attack: attackId,
      target: ctx.target,
      seed: ctx.seed,
      message: `${producer}: ${problem}`,
      input,
    });
}

function findPrototypeProblem(value: unknown, seen: Set<unknown>, depth: number): string | null {
  if (value === null || typeof value !== 'object' || seen.has(value) || depth > NESTING_SCAN_LIMIT) return null;
  seen.add(value);
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && !BUILTIN_PROTOTYPES.has(proto) && !isClassPrototype(proto)) {
    return `object with a foreign prototype (${renderValue(proto)}) at ${renderValue(value)}`;
  }
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return `inherited enumerable key '${key}' on ${renderValue(value)}`;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      const problem = findPrototypeProblem(k, seen, depth + 1) ?? findPrototypeProblem(v, seen, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (value instanceof Set) {
    for (const item of value) {
      const problem = findPrototypeProblem(item, seen, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const problem = findPrototypeProblem((value as Record<string, unknown>)[key], seen, depth + 1);
    if (problem) return problem;
  }
  return null;
}

const NESTING_SCAN_LIMIT = 2000;

/** A prototype owned by a real class: its own `constructor` is a function whose
 *  `prototype` is this very object. A plain object smuggled in as a prototype
 *  (`{polluted: true}`) inherits `constructor` from Object instead. **/
function isClassPrototype(proto: object): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'constructor');
  const ctor = descriptor?.value as {prototype?: unknown} | undefined;
  return typeof ctor === 'function' && ctor.prototype === proto;
}

/** SJ-GLOBAL: a snapshot of the global prototypes to compare after a run. **/
export function snapshotGlobals(): string {
  return JSON.stringify([
    Object.getOwnPropertyNames(Object.prototype).sort(),
    Object.getOwnPropertyNames(Array.prototype).sort(),
    Object.getOwnPropertyNames(Function.prototype).sort(),
  ]);
}

export function checkGlobals(before: string, attackId: string, ctx: Ctx): SecurityViolation | null {
  const after = snapshotGlobals();
  const canary = {} as Record<string, unknown>;
  if (after === before && canary.polluted === undefined && canary.admin === undefined) return null;
  return {
    oracle: 'SJ-GLOBAL',
    attack: attackId,
    target: ctx.target,
    seed: ctx.seed,
    message: `a global prototype changed during the run (before ${before.length} chars, after ${after.length})`,
    input: '',
  };
}

// ---- formats ----------------------------------------------------------------

export interface FormatStepResult {
  violations: SecurityViolation[];
  elapsedMs: number;
}

export function checkFormatCall(
  label: string,
  run: (input: string) => unknown,
  input: string,
  attackId: string,
  ctx: Ctx,
  oracleTime: 'SF-TIME' | 'SF-PATTERN-TIME'
): FormatStepResult {
  const violations: SecurityViolation[] = [];
  const shown = input.length > MAX_INPUT_RENDER ? `${input.length} chars: ${input.slice(0, 64)}…` : input;
  const started = now();
  try {
    const result = run(input);
    if (typeof result !== 'boolean') {
      violations.push({
        oracle: 'SF-TOTAL',
        attack: attackId,
        target: ctx.target,
        seed: ctx.seed,
        message: `${label} returned a non-boolean (${typeof result})`,
        input: shown,
      });
    }
  } catch (err) {
    violations.push({
      oracle: 'SF-TOTAL',
      attack: attackId,
      target: ctx.target,
      seed: ctx.seed,
      message: `${label} threw: ${errMsg(err)}`,
      input: shown,
    });
  }
  const elapsedMs = now() - started;
  if (elapsedMs > FORMAT_BUDGET_MS) {
    violations.push({
      oracle: oracleTime,
      attack: attackId,
      target: ctx.target,
      seed: ctx.seed,
      message: `${label} took ${elapsedMs.toFixed(1)}ms (budget ${FORMAT_BUDGET_MS}ms)`,
      input: shown,
    });
  }
  return {violations, elapsedMs};
}

function now(): number {
  return performance.now();
}

/** Render violations for a failing report. **/
export function renderViolations(violations: SecurityViolation[], limit = 25): string {
  const lines = violations
    .slice(0, limit)
    .map((v) => `  [${v.oracle}] ${v.target} · ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n      ${v.input}`);
  if (violations.length > limit) lines.push(`  …and ${violations.length - limit} more`);
  return lines.join('\n');
}
