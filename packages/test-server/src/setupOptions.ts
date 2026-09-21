/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The specs build their setup() call as a STRING and evaluate it inside the sandbox, so nothing type
// checks the options; without this guard a misspelled or removed key reads as undefined and the block
// silently runs the default configuration.

/** Throws unless every key of `options` is one the fixture declares. */
export function assertKnownSetupOptions(options: object | undefined, knownKeys: readonly string[], label: string): void {
  if (!options) return;
  const unknown = Object.keys(options).filter((key) => !knownKeys.includes(key));
  if (!unknown.length) return;
  throw new Error(`${label}: unknown setup option(s) ${unknown.join(', ')}. Known options: ${knownKeys.join(', ')}`);
}
