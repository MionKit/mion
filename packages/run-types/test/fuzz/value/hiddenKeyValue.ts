// Takes one key of a plain object off its own enumerable keys, value still readable, as a class getter is. O21 pins that
// validate and its error report agree on these values, O28 that a hidden declared prop still passes strict.

import {deepCopyValue} from '../cloning/extrasValue.ts';

export const HIDDEN_KEY_MODES = ['nonEnumerable', 'inherited', 'getter'] as const;
type HiddenKeyMode = (typeof HIDDEN_KEY_MODES)[number];
type PlainObjectAt = {target: object; path: (string | number)[]};

export interface HiddenKeyValue {
  value: unknown;
  path: (string | number)[];
  key: string;
  mode: HiddenKeyMode;
}

/** Gives a hidden getter the prototype of a real class accessor. **/
class ClassPrototype {}

/** Plain objects with an own key, reached only through plain objects and arrays. **/
function collectPlainObjects(value: unknown, path: (string | number)[], out: PlainObjectAt[]) {
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
  const objects: PlainObjectAt[] = [];
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
    const prototype = Object.defineProperty(Object.create(ClassPrototype.prototype), key, {get: () => held, configurable: true});
    Object.setPrototypeOf(record, prototype);
  }
  return {value: copy, path, key, mode};
}
