/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Splits a single-call builder's props into drizzle's config argument and modifier calls, replayed in key order.

import {RtColumnRecorder, type DrizzleContext} from '../src/recorder.ts';
import {isColModName} from '../src/typeColumns.ts';

/** Record a builder call `(name?, props?)`: `init` builds from the config half, the modifiers replay on it. */
export function recordColumn(args: unknown[], init: (context: DrizzleContext, callArgs: unknown[]) => unknown): RtColumnRecorder {
  const [name, props] = (typeof args[0] === 'string' ? args : [undefined, args[0]]) as [
    string | undefined,
    Record<string, unknown> | undefined,
  ];
  const config: Record<string, unknown> = {};
  const mods: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (isColModName(key)) mods.push([key, value]);
    else config[key] = value;
  }
  const callArgs: unknown[] = [];
  if (name !== undefined) callArgs.push(name);
  if (Object.keys(config).length > 0) callArgs.push(config);
  const recorder = new RtColumnRecorder((context) => init(context, callArgs));
  const methods = recorder as unknown as Record<string, (...modArgs: unknown[]) => unknown>;
  for (const [method, value] of mods) {
    // Type-only in drizzle too: nothing to replay.
    if (method === '$type') continue;
    if (value === true) methods[method]();
    else if (Array.isArray(value)) methods[method](...value);
    else throw new Error(`@mionjs/drizzle-orm: modifier "${method}" takes \`true\` or its argument tuple, got ${String(value)}`);
  }
  return recorder;
}
