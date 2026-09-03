// The security oracles: what must hold for EVERY input, hostile or not.
//
//   Binary decoder (secbinary lane)
//     SB-THROWS     a decode either returns or throws an Error; never a bare
//                   non-Error throw, never garbage. (The decoders deliberately
//                   throw whatever the failing arm throws, no wrapper: a caller
//                   catches and rethrows. `parse` is the typed entry point.)
//     SB-BOUNDS     when a decode returns, the deserializer's index never sits
//                   past the end of the buffer (a silent short read).
//     SB-TOTAL      `validate(decoded)` returns a boolean without throwing, and
//                   a value it accepts re-encodes without throwing.
//     SB-REJECT     bytes marked `expect: 'reject'` never decode into a value
//                   `validate` accepts.
//     SB-TIME       one decode stays under a budget scaled by input length.
//     SB-ISOLATION  after an attack, the valid wire still decodes to the same
//                   bytes (no cross-decode state poisoning).
//     SB-OOM        the heap cap tripped, or a step never returned (recorded by
//                   the worker host as a crash with the step seed).
//
//   JSON decoders + parse (secjson lane)
//     SJ-PARSE      `parse` throws only RTParseError.
//     SJ-REJECT     an `expect: 'reject'` payload never gets through `parse`,
//                   and never decodes into a value `validate` accepts.
//     SJ-PROTO      a returned value has a sane prototype at every object
//                   position and no inherited enumerable keys.
//     SJ-GLOBAL     Object.prototype / Array.prototype are untouched.
//     SJ-TOTAL      `validate(decoded)` is a boolean without a throw.
//     SJ-TIME       every call inside a budget.
//     (a decoder throw is counted by class in the report, not a violation)
//
//   Format validators (secformat lane)
//     SF-TOTAL      returns a boolean, never throws.
//     SF-TIME       one call under the budget.
//     SF-PATTERN-TIME  the same for each registered pattern regex.
//
// Erasable TypeScript only: the worker thread loads this file natively.

export type SecurityOracleId =
  | 'SB-THROWS'
  | 'SB-BOUNDS'
  | 'SB-TOTAL'
  | 'SB-REJECT'
  | 'SB-TIME'
  | 'SB-ISOLATION'
  | 'SB-OOM'
  | 'SJ-PARSE'
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

export function renderBytes(bytes: Uint8Array): string {
  const head = Array.from(bytes.subarray(0, 48), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return `${bytes.length} bytes: ${head}${bytes.length > 48 ? ' …' : ''}`;
}

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

export interface BinaryDecodeProbe {
  /** Runs the compiled decoder over a FRESH deserializer for `bytes` and
   *  reports where its index ended. **/
  decode: (bytes: Uint8Array) => {value: unknown; index: number; byteLength: number};
  validate: (value: unknown) => boolean;
  encode: (value: unknown) => Uint8Array;
}

interface Ctx {
  target: string;
  seed: number;
}

export interface BinaryStepResult {
  violations: SecurityViolation[];
  /** 'returned' | the error name, for the report's throw histogram. **/
  outcome: string;
}

/** Run every binary oracle over one attack. **/
export function checkBinaryDecode(
  probe: BinaryDecodeProbe,
  attack: {id: string; expect: 'reject' | 'any'; bytes: Uint8Array},
  ctx: Ctx
): BinaryStepResult {
  const violations: SecurityViolation[] = [];
  const input = renderBytes(attack.bytes);
  const push = (oracle: SecurityOracleId, message: string): void => {
    violations.push({oracle, attack: attack.id, target: ctx.target, seed: ctx.seed, message, input});
  };

  const started = now();
  let decoded: {value: unknown; index: number; byteLength: number} | undefined;
  let outcome = 'returned';
  try {
    decoded = probe.decode(attack.bytes);
  } catch (err) {
    if (!(err instanceof Error)) push('SB-THROWS', `decode threw a non-Error: ${String(err)}`);
    outcome = err instanceof Error ? err.name : 'non-Error';
  }
  const elapsed = now() - started;
  const budget = decodeBudgetMs(attack.bytes.length);
  if (elapsed > budget) push('SB-TIME', `decode took ${elapsed.toFixed(1)}ms (budget ${budget.toFixed(0)}ms)`);
  if (!decoded) return {violations, outcome};

  if (decoded.index > decoded.byteLength) {
    push(
      'SB-BOUNDS',
      `decode returned with index ${decoded.index} past the ${decoded.byteLength}-byte buffer: ${renderValue(decoded.value)}`
    );
  }

  let accepted: boolean | undefined;
  try {
    accepted = probe.validate(decoded.value);
    if (typeof accepted !== 'boolean')
      push('SB-TOTAL', `validate returned a non-boolean (${typeof accepted}) on the decoded value`);
  } catch (err) {
    push('SB-TOTAL', `validate threw on the decoded value: ${errMsg(err)}`);
  }
  if (accepted === true) {
    if (attack.expect === 'reject')
      push('SB-REJECT', `bytes that cannot encode the type decoded into a value validate accepts: ${renderValue(decoded.value)}`);
    try {
      probe.encode(decoded.value);
    } catch (err) {
      push('SB-TOTAL', `re-encoding an accepted decoded value threw: ${errMsg(err)}`);
    }
  }
  return {violations, outcome};
}

/** SB-ISOLATION: the valid wire must still round-trip byte for byte. **/
export function checkIsolation(
  probe: BinaryDecodeProbe,
  validWire: Uint8Array,
  attackId: string,
  ctx: Ctx
): SecurityViolation | null {
  try {
    const decoded = probe.decode(validWire);
    const again = probe.encode(decoded.value);
    if (!sameBytes(again, validWire)) {
      return {
        oracle: 'SB-ISOLATION',
        attack: attackId,
        target: ctx.target,
        seed: ctx.seed,
        message: `after the attack the valid wire no longer round-trips: ${renderBytes(again)} vs ${renderBytes(validWire)}`,
        input: renderBytes(validWire),
      };
    }
  } catch (err) {
    return {
      oracle: 'SB-ISOLATION',
      attack: attackId,
      target: ctx.target,
      seed: ctx.seed,
      message: `after the attack the valid wire no longer decodes: ${errMsg(err)}`,
      input: renderBytes(validWire),
    };
  }
  return null;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- JSON side --------------------------------------------------------------

export interface JsonProbe {
  parse?: (value: unknown) => unknown;
  decoders: Record<string, (text: string) => unknown>;
  validate: (value: unknown) => boolean;
}

export interface JsonStepResult {
  violations: SecurityViolation[];
  /** Throw histogram: `<decoder>:<ErrorName>` → count. **/
  throws: Record<string, number>;
}

/** Run every JSON oracle over one attack. **/
export function checkJsonDecode(
  probe: JsonProbe,
  attack: {id: string; expect: 'reject' | 'any'; text: string; tree: unknown},
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

  if (probe.parse) {
    let parsed: unknown;
    let threw = false;
    try {
      parsed = timed('parse', () => probe.parse!(structuredClone(attack.tree)));
    } catch (err) {
      threw = true;
      const name = err instanceof Error ? err.name : 'non-Error';
      if (name !== 'RTParseError') push('SJ-PARSE', `parse threw ${errMsg(err)} instead of RTParseError`);
    }
    if (!threw) {
      if (attack.expect === 'reject') push('SJ-REJECT', `parse accepted a payload the type rules out: ${renderValue(parsed)}`);
      checkPrototypes(parsed, 'parse', attack.id, ctx, violations, input);
      let accepted: boolean | undefined;
      try {
        accepted = probe.validate(parsed);
      } catch (err) {
        push('SJ-TOTAL', `validate threw on parse's output: ${errMsg(err)}`);
      }
      if (accepted === false) push('SJ-REJECT', `parse returned a value validate refuses: ${renderValue(parsed)}`);
    }
  }

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
