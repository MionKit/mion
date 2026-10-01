// Diagnostics match what each compiled function does. D1: every throw (on create or call) is a `[CODE]` reported at
// its call site; D2: a reported always-throw code means the function throws; D3: a round-trip drop has a drop note.

import type {Violation} from '../value/fuzzOracle.ts';
import {snapshot} from '../value/fuzzOracle.ts';
import type {WiredFns} from './typeFuzzHarness.ts';

/** The codes an alwaysThrow entry carries (internal/diagnostics/codes_runtype.go). **/
const ALWAYS_THROW_CODE = /^(?:(?:VL|VE|PJ|PJS|RJ)00\d|RUK00[1456]|TFN001)$/;
/** The notes a family leaves when it drops a member DataOnly strips. **/
const DROP_NOTE_CODE = /^(?:(?:VL|VE|PJ|PJS|RJ|RUK)01\d|UPN001)$/;

/** Whether a code is a family's drop note. **/
export function isDropNote(code: string): boolean {
  return DROP_NOTE_CODE.test(code);
}

/** An error with no code is a bug: no diagnostic can name it. **/
export interface ThrowOutcome {
  thrownCode?: string;
  uncontrolledError?: string;
}

export interface FnOutcome extends ThrowOutcome {
  key: keyof WiredFns;
  codesAtSite: ReadonlySet<string>;
}

export type DiagContext = Pick<Violation, 'target' | 'seed'> & {source: string};

/** The `[CODE]` a controlled alwaysThrow message opens with. **/
export function controlledCode(message: string): string | undefined {
  return /^\[([A-Z][A-Z0-9]*)\]/.exec(message)?.[1];
}

export function classifyThrow(err: unknown): ThrowOutcome {
  const message = err instanceof Error ? err.message : String(err);
  const code = controlledCode(message);
  return code ? {thrownCode: code} : {uncontrolledError: message};
}

function violation(oracle: 'D1' | 'D2' | 'D3', message: string, ctx: DiagContext): Violation {
  return {oracle, target: ctx.target, seed: ctx.seed, phase: 'compile', message, value: snapshot(ctx.source)};
}

export function checkThrowReported(outcome: FnOutcome, ctx: DiagContext): Violation | null {
  if (outcome.uncontrolledError !== undefined)
    return violation(
      'D1',
      `${outcome.key} threw an error with no code, so no diagnostic can name it: ${outcome.uncontrolledError}`,
      ctx
    );
  if (!outcome.thrownCode || outcome.codesAtSite.has(outcome.thrownCode)) return null;
  return violation(
    'D1',
    `${outcome.key} throws [${outcome.thrownCode}] but its call site reports only ${[...outcome.codesAtSite].join(', ') || 'nothing'}`,
    ctx
  );
}

export function checkReportedThrows(outcome: FnOutcome, ctx: DiagContext): Violation | null {
  const reported = [...outcome.codesAtSite].filter((code) => ALWAYS_THROW_CODE.test(code));
  if (reported.length === 0 || outcome.thrownCode) return null;
  return violation('D2', `${outcome.key}'s call site reports ${reported.join(', ')} but the function runs without throwing`, ctx);
}

export function checkDropNoted(
  key: keyof WiredFns,
  dropped: string[],
  codes: ReadonlySet<string>,
  ctx: DiagContext
): Violation | null {
  if (dropped.length === 0 || [...codes].some((code) => DROP_NOTE_CODE.test(code))) return null;
  return violation(
    'D3',
    `${key} dropped ${dropped.join(', ')} with no drop note at its call sites (${[...codes].join(', ') || 'nothing'})`,
    ctx
  );
}

/** Paths `input` holds and `output` lacks; `undefined` is absent on the wire by design, and so is `null` under
 *  `nullMayVanish` (compact writes an absent optional as `null`). **/
export function droppedPaths(input: unknown, output: unknown, nullMayVanish = false, path = '$'): string[] {
  if (input === null || typeof input !== 'object' || output === null || typeof output !== 'object') return [];
  if (input instanceof Map && output instanceof Map) {
    const dropped: string[] = [];
    const outEntries = [...output];
    [...input].forEach(([key, value], index) => {
      const label = `${path}.get(${String(key)})`;
      if (output.has(key)) dropped.push(...droppedPaths(value, output.get(key), nullMayVanish, label));
      // A decoded object key is a new object, so pair it by position.
      else if (typeof key === 'object' && key !== null && index < outEntries.length) {
        const [outKey, outValue] = outEntries[index];
        dropped.push(...droppedPaths(key, outKey, nullMayVanish, `${path}.keys()[${index}]`));
        dropped.push(...droppedPaths(value, outValue, nullMayVanish, label));
      }
    });
    return dropped;
  }
  if (input instanceof Set && output instanceof Set) return droppedPaths([...input], [...output], nullMayVanish, path);
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((item, index) =>
      index < output.length ? droppedPaths(item, output[index], nullMayVanish, `${path}[${index}]`) : []
    );
  }
  if (Array.isArray(input) || Array.isArray(output) || input instanceof Date || input instanceof Set) return [];
  const dropped: string[] = [];
  const record = input as Record<PropertyKey, unknown>;
  const outRecord = output as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (!Object.prototype.propertyIsEnumerable.call(record, key) || record[key] === undefined) continue;
    if (nullMayVanish && record[key] === null) continue;
    const name = typeof key === 'symbol' ? `[${key.description ?? 'symbol'}]` : key;
    if (!Reflect.has(outRecord, key)) dropped.push(`${path}.${name}`);
    else dropped.push(...droppedPaths(record[key], outRecord[key], nullMayVanish, `${path}.${name}`));
  }
  return dropped;
}

/** Copies containers but keeps leaves by reference, so an in-place encoder cannot change what droppedPaths compares. **/
export function copyTree(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, item] of value) copy.set(copyTree(key, seen), copyTree(item, seen));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const item of value) copy.add(copyTree(item, seen));
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(copyTree(item, seen));
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
  const copy: Record<PropertyKey, unknown> = {};
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (Object.prototype.propertyIsEnumerable.call(value, key))
      copy[key] = copyTree((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return copy;
}
