// Takes one key of a plain object off its own enumerable keys, value still readable. Validate counts keys where the
// error report names them, so O21 over these values pins that both agree when a declared prop hides.

import {deepCopyValue} from '../cloning/extrasValue.ts';

export type HiddenKeyMode = 'nonEnumerable' | 'inherited' | 'getter';
export const HIDDEN_KEY_MODES: readonly HiddenKeyMode[] = ['nonEnumerable', 'inherited', 'getter'];

export interface HiddenKeyValue {
  value: unknown;
  path: (string | number)[];
  key: string;
  mode: HiddenKeyMode;
}

/** Plain objects with an own key, reached only through plain objects and arrays. **/
function collectPlainObjects(value: unknown, path: (string | number)[], out: {target: object; path: (string | number)[]}[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPlainObjects(item, [...path, index], out));
    return;
  }
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) return;
  if (Object.keys(value).length > 0) out.push({target: value, path});
  for (const key of Object.keys(value)) collectPlainObjects((value as Record<string, unknown>)[key], [...path, key], out);
}

/** A copy of `value` with one random own key hidden, or null when it holds no plain object with a key. **/
export function hideOwnKey(value: unknown, random: () => number): HiddenKeyValue | null {
  const copy = deepCopyValue(value);
  const objects: {target: object; path: (string | number)[]}[] = [];
  collectPlainObjects(copy, [], objects);
  if (objects.length === 0) return null;
  const {target, path} = objects[Math.floor(random() * objects.length)];
  const record = target as Record<string, unknown>;
  const keys = Object.keys(record);
  const key = keys[Math.floor(random() * keys.length)];
  const mode = HIDDEN_KEY_MODES[Math.floor(random() * HIDDEN_KEY_MODES.length)];
  const held = record[key];
  delete record[key];
  if (mode === 'nonEnumerable') {
    Object.defineProperty(record, key, {value: held, enumerable: false, writable: true, configurable: true});
  } else if (mode === 'inherited') {
    Object.setPrototypeOf(record, {[key]: held});
  } else {
    Object.setPrototypeOf(record, Object.defineProperty({}, key, {get: () => held, enumerable: false, configurable: true}));
  }
  return {value: copy, path, key, mode};
}
