/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// How harness/run.mjs varies and breaks a request body without knowing its wire. Pure on purpose:
// a body is keyed JSON on most lanes and positional on the compact one, and both are cut at the
// same place, the id's own digits.

/**
 * Split a body around its numeric id, so wrk can stamp a fresh one per request.
 *
 * Every payload in shared/payloads.mjs varies nothing but its id, so the whole per-request
 * difference is that one number. Cutting on the value rather than on a `"id":` key is what lets a
 * positional body, which has no keys, take the same path. The id must appear exactly once, as a
 * whole number: a second hit would leave wrk stamping the wrong one.
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

/** The same body with a string where the id goes, which every lane must reject before it is measured. */
export const invalidBody = ({prefix, suffix}) => `${prefix}"not-a-number"${suffix}`;
