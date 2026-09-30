// Diagnostics match what each compiled function does. D1: a controlled `[CODE]` throw (on create or call) is reported
// at its call site; D2: a reported always-throw code means the function throws; D3: a round-trip drop has a drop note.

import type {Violation} from '../value/fuzzOracle.ts';
import {snapshot} from '../value/fuzzOracle.ts';

/** The codes an alwaysThrow entry carries (internal/diagnostics/codes_runtype.go). **/
export const ALWAYS_THROW_CODE = /^(?:(?:VL|VE|PJ|PJS|RJ)00\d|RUK00[1456]|TFN001)$/;
/** The notes a family leaves when it drops a member DataOnly strips. **/
export const DROP_NOTE_CODE = /^(?:(?:VL|VE|PJ|PJS|RJ|RUK)01\d|UPN001)$/;

/** One compiled function: its call site's reported codes and the controlled code it threw, if any. **/
export interface FnOutcome {
  key: string;
  codesAtSite: ReadonlySet<string>;
  thrownCode?: string;
}

export interface DiagContext {
  target: string;
  seed: number;
  source: string;
}

/** The `[CODE]` a controlled alwaysThrow message opens with. **/
export function controlledCode(message: string): string | undefined {
  return /^\[([A-Z][A-Z0-9]*)\]/.exec(message)?.[1];
}

function violation(oracle: 'D1' | 'D2' | 'D3', message: string, ctx: DiagContext): Violation {
  return {oracle, target: ctx.target, seed: ctx.seed, phase: 'compile', message, value: snapshot(ctx.source)};
}

export function checkThrowReported(outcome: FnOutcome, ctx: DiagContext): Violation | null {
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

export function checkDropNoted(key: string, dropped: string[], codes: ReadonlySet<string>, ctx: DiagContext): Violation | null {
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
    for (const [key, value] of input) {
      if (output.has(key)) dropped.push(...droppedPaths(value, output.get(key), nullMayVanish, `${path}.get(${String(key)})`));
    }
    return dropped;
  }
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
  if (value === null || typeof value !== 'object' || value instanceof Date || value instanceof Set) return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, item] of value) copy.set(key, copyTree(item, seen));
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
