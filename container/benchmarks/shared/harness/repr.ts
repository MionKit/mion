// A faithful, lossless-enough string representation of any sample value for the
// alignment audit's per-misalignment records. JSON.stringify alone drops or
// mangles the exact values this suite leans on (NaN, Infinity, BigInt, Symbol,
// undefined, Invalid Date, functions, cyclic refs), so the audit needs its own
// small serializer — see open question 2 in the todo. The goal is a short,
// human-readable repr for the report, NOT a round-trippable encoding.

const MAX_LEN = 120;

function clip(text: string): string {
  return text.length > MAX_LEN ? text.slice(0, MAX_LEN - 1) + '…' : text;
}

function reprPrimitive(value: unknown): string | null {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const kind = typeof value;
  if (kind === 'string') return JSON.stringify(value);
  if (kind === 'bigint') return `${value as bigint}n`;
  if (kind === 'boolean') return String(value);
  if (kind === 'symbol') return `Symbol(${(value as symbol).description ?? ''})`;
  if (kind === 'function') return `[Function ${(value as {name?: string}).name || 'anonymous'}]`;
  if (kind === 'number') {
    const num = value as number;
    if (Number.isNaN(num)) return 'NaN';
    if (num === Infinity) return 'Infinity';
    if (num === -Infinity) return '-Infinity';
    return String(num);
  }
  return null;
}

function reprObject(value: object, seen: WeakSet<object>): string {
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Date(Invalid)' : `Date(${value.toISOString()})`;
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (Array.isArray(value)) return `[${value.map((item) => reprInner(item, seen)).join(', ')}]`;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => `${key}: ${reprInner(val, seen)}`);
  const symbolKeys = Object.getOwnPropertySymbols(value).map((sym) => `[${reprPrimitive(sym)}]: …`);
  return `{${[...entries, ...symbolKeys].join(', ')}}`;
}

function reprInner(value: unknown, seen: WeakSet<object>): string {
  const primitive = reprPrimitive(value);
  if (primitive !== null) return primitive;
  return reprObject(value as object, seen);
}

/** Short, human-readable repr of a sample value — handles every non-JSON value
 *  the suite uses (NaN / Infinity / BigInt / Symbol / undefined / Invalid Date /
 *  function / cyclic). Clipped to a fixed length for the report tables. */
export function reprValue(value: unknown): string {
  try {
    return clip(reprInner(value, new WeakSet<object>()));
  } catch (err) {
    return `[unrepresentable: ${err instanceof Error ? err.message : String(err)}]`;
  }
}
