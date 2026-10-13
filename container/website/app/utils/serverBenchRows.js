// A twin (mion.compact of mion) shares its base's dataset but is drawn only on charts that ask, so it never crowds them.
// Plain JS typed in JSDoc: host tests load it, and the site's generated tsconfig only exists in its image.

/** @typedef {{app: string, twinOf?: string | null}} TwinRow */

/**
 * Twins hidden by default; `twins` names a base lane and draws only it and its twins.
 * @template {TwinRow} Row
 * @param {Row[]} rows
 * @param {string} [twins]
 * @returns {Row[]}
 */
export function visibleRows(rows, twins = '') {
  if (!twins) return rows.filter((row) => !row.twinOf)
  return rows.filter((row) => row.app === twins || row.twinOf === twins)
}

/**
 * A twin's measured change against its base on one metric, in percent; null on a base row or a missing value.
 * @template {TwinRow} Row
 * @param {Row} row
 * @param {Row[]} rows
 * @param {keyof Row} metric
 * @returns {number | null}
 */
export function changeVsBase(row, rows, metric) {
  if (!row.twinOf) return null
  const base = rows.find((entry) => entry.app === row.twinOf)
  const own = row[metric]
  const baseValue = base?.[metric]
  if (typeof own !== 'number' || typeof baseValue !== 'number' || baseValue === 0) return null
  return ((own - baseValue) / baseValue) * 100
}

/**
 * `-38%` / `+4%`, rounded to a whole percent.
 * @param {number} percent
 * @returns {string}
 */
export function formatChange(percent) {
  const rounded = Math.round(percent)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
