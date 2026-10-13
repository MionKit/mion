/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// How harness/run.mjs varies and breaks a request body without knowing its wire. Pure on purpose:
// keyed and positional bodies are both cut at the id's own digits.

/**
 * Payloads vary only by id, so wrk stamps a fresh one between the halves; cut on the value: positional bodies have no keys.
 * The id must appear exactly once: a second hit would leave wrk stamping the wrong one.
 */
export function bodyTemplate(body, id) {
  const digits = String(id);
  if (!/^\d+$/.test(digits)) throw new Error(`the payload id must be a whole number to vary per request, got ${digits}`);
  const pattern = new RegExp(`(?<![\\d.\\w])${digits}(?![\\d.eE\\w])`, 'g');
  const hits = [...body.matchAll(pattern)];
  if (hits.length === 0) throw new Error(`the payload does not carry its id ${digits}: ${body.slice(0, 120)}`);
  if (hits.length > 1) throw new Error(`the payload id ${digits} appears ${hits.length} times, so there is no single place to vary it`);
  const at = hits[0].index;
  return {prefix: body.slice(0, at), suffix: body.slice(at + digits.length)};
}

/** Every lane must reject this before it is measured. */
export const invalidBody = ({prefix, suffix}) => `${prefix}"not-a-number"${suffix}`;
