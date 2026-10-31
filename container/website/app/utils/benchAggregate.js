// The summary math the benchmark tables share: a geometric mean per library over every
// case at least one library runs. BenchTable (the full per-page tables) and
// HomeBenchTable (the headline rows on the root landing) both read it from here, so
// the "Overall" row on a benchmark page and the number the home page quotes for the
// same dataset can never be computed two different ways.
// Plain JS typed in JSDoc: host tests load it, and the site's generated tsconfig only exists in its image.

/** @typedef {'ok' | 'fail' | 'not-supported'} AggregateStatus */
/** @typedef {'valid' | 'invalid' | 'mixed'} AggregatePath */
/** One metric for a competitor: throughput on the valid, invalid and mixed input streams.
 *  @typedef {{valid?: number, invalid?: number, mixed?: number, status?: AggregateStatus}} AggregateResult */
/** results[competitor][metricKey] -> the measured paths.
 *  @typedef {{key: string, results: Record<string, Record<string, AggregateResult>>}} AggregateCase */
/** @typedef {Record<string, Record<AggregatePath, number | null>>} AggregateValues */
/** A section as the aggregate reads it: its cases, plus the label and the repo-relative file that
 *  authors its cases (the chart's GitHub link).
 *  @typedef {{key: string, label: string, source?: string, cases: AggregateCase[]}} AggregateSection */
/** One summary row: a geometric mean per competitor over one section, or over every case (`__overall__`).
 *  @typedef {{key: string, label: string, source?: string, values: AggregateValues}} AggregateRow */

/** @type {AggregatePath[]} */
const PATHS = ['valid', 'invalid', 'mixed']

/**
 * Geometric mean of the positive values: outlier-resistant summary across cases.
 * @param {number[]} values
 * @returns {number | null}
 */
export function geomean(values) {
  const positive = values.filter((value) => typeof value === 'number' && value > 0)
  if (positive.length === 0) return null
  return Math.exp(positive.reduce((acc, value) => acc + Math.log(value), 0) / positive.length)
}

/**
 * A competitor "supports" a case for a metric when it ran (not fail / not-supported).
 * @param {AggregateCase} kase
 * @param {string} comp
 * @param {string} metricKey
 * @returns {boolean}
 */
export function caseSupported(kase, comp, metricKey) {
  const result = kase.results[comp]?.[metricKey]
  return !!result && result.status !== 'fail' && result.status !== 'not-supported'
}

/**
 * The measured value of one competitor on one case, or null when it did not run. For
 * throughput 0 means "not timed"; for a lower-is-better count 0 is real and the best.
 * @param {AggregateCase} kase
 * @param {string} comp
 * @param {string} metricKey
 * @param {AggregatePath} path
 * @param {boolean} lowerBetter
 * @returns {number | null}
 */
function measured(kase, comp, metricKey, path, lowerBetter) {
  if (!caseSupported(kase, comp, metricKey)) return null
  const value = kase.results[comp]?.[metricKey]?.[path]
  if (typeof value !== 'number') return null
  if (lowerBetter) return value >= 0 ? value : null
  return value > 0 ? value : null
}

/**
 * Geometric mean per participant over every case at least one participant ran on `path`.
 * A participant that did not run a case scores it at the WORST value among those that did
 * (lowest throughput, highest count). So a case only one library runs gives everyone the
 * same number and moves no ratio, and skipping a case never makes a library look faster.
 * Counts keep their zeros through +1 smoothing (geomean of value+1, minus 1): a zero is a
 * type that resolved with no extra instantiations, the best outcome, never "no data".
 * @param {AggregateCase[]} cases
 * @param {string[]} participants
 * @param {string} metricKey
 * @param {AggregatePath} path
 * @param {boolean} lowerBetter
 * @returns {Record<string, number | null>}
 */
function meanWithWorstFill(cases, participants, metricKey, path, lowerBetter) {
  const logSums = participants.map(() => 0)
  let counted = 0
  for (const kase of cases) {
    const values = participants.map((comp) => measured(kase, comp, metricKey, path, lowerBetter))
    const ran = /** @type {number[]} */ (values.filter((value) => value !== null))
    if (ran.length === 0) continue
    const worst = lowerBetter ? Math.max(...ran) : Math.min(...ran)
    counted++
    values.forEach((value, i) => {
      const filled = value ?? worst
      logSums[i] += Math.log(lowerBetter ? filled + 1 : filled)
    })
  }
  return Object.fromEntries(
    participants.map((comp, i) => {
      if (counted === 0) return [comp, null]
      const mean = Math.exp(logSums[i] / counted)
      return [comp, lowerBetter ? mean - 1 : mean]
    })
  )
}

/**
 * One row's means: the participants (competitors that ran >=1 of these cases) and their
 * geometric means per path, every participant over the SAME cases (meanWithWorstFill).
 * Participants are row-local, so a group one library cannot do at all leaves it n-a there
 * instead of filling the whole group with other libraries' numbers.
 * @param {AggregateCase[]} cases
 * @param {string[]} competitors
 * @param {string} metricKey
 * @param {boolean} [lowerBetter]
 * @returns {{participants: string[], values: AggregateValues}}
 */
export function rowMeans(cases, competitors, metricKey, lowerBetter = false) {
  const participants = competitors.filter((comp) => cases.some((kase) => caseSupported(kase, comp, metricKey)))
  const byPath = Object.fromEntries(PATHS.map((path) => [path, meanWithWorstFill(cases, participants, metricKey, path, lowerBetter)]))
  /** @type {AggregateValues} */
  const values = {}
  for (const comp of competitors) {
    const own = participants.includes(comp)
    values[comp] = /** @type {Record<AggregatePath, number | null>} */ (
      Object.fromEntries(PATHS.map((path) => [path, own ? (byPath[path][comp] ?? null) : null]))
    )
  }
  return {participants, values}
}

/**
 * The per-section geometric means plus a final `__overall__` row over every case, all
 * computed by rowMeans.
 * @param {AggregateSection[]} sections
 * @param {string[]} competitors
 * @param {string} metricKey
 * @param {boolean} [lowerBetter]
 * @returns {AggregateRow[]}
 */
export function aggregateRows(sections, competitors, metricKey, lowerBetter = false) {
  /** @type {AggregateRow[]} */
  const rows = sections.map((section) => ({
    key: section.key,
    label: section.label,
    source: section.source,
    values: rowMeans(section.cases, competitors, metricKey, lowerBetter).values,
  }))
  const everyCase = sections.flatMap((section) => section.cases)
  rows.push({key: '__overall__', label: 'Overall', values: rowMeans(everyCase, competitors, metricKey, lowerBetter).values})
  return rows
}
