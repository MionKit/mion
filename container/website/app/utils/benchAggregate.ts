// The summary math the benchmark tables share: a geometric mean per library over the
// cases every compared library supports. BenchTable (the full per-page tables) and
// HomeBenchTable (the headline rows on the root landing) both read it from here, so
// the "Overall" row on a benchmark page and the number the home page quotes for the
// same dataset can never be computed two different ways.

export type AggregateStatus = 'ok' | 'fail' | 'not-supported'
export type AggregatePath = 'valid' | 'invalid' | 'mixed'

/** One metric for a competitor: throughput on the valid, invalid and mixed input streams. */
export interface AggregateResult {
  valid?: number
  invalid?: number
  mixed?: number
  status?: AggregateStatus
}

/** results[competitor][metricKey] -> the measured paths. */
export interface AggregateCase {
  key: string
  results: Record<string, Record<string, AggregateResult>>
}

/** Geometric mean of the positive values: outlier-resistant summary across cases. */
export function geomean(values: number[]): number | null {
  const positive = values.filter((value) => typeof value === 'number' && value > 0)
  if (positive.length === 0) return null
  return Math.exp(positive.reduce((acc, value) => acc + Math.log(value), 0) / positive.length)
}

/** A competitor "supports" a case for a metric when it ran (not fail / not-supported). */
export function caseSupported(kase: AggregateCase, comp: string, metricKey: string): boolean {
  const result = kase.results[comp]?.[metricKey]
  return !!result && result.status !== 'fail' && result.status !== 'not-supported'
}

/** Fair comparison basis for an aggregate row: the participants (competitors that
 *  support >=1 of these cases) and the COMMON cases EVERY participant supports.
 *  Geomeans are taken over the common set so a library is never penalised in the
 *  mean for ALSO supporting harder cases the others can't express, otherwise a
 *  broad library's slow exclusive cases drag its mean below a narrow library that
 *  never attempts them. Participants are row-local, so a category one lib can't do
 *  at all doesn't blank the whole row. */
export function commonBasis(cases: AggregateCase[], competitors: string[], metricKey: string): {participants: string[]; common: AggregateCase[]} {
  const participants = competitors.filter((comp) => cases.some((kase) => caseSupported(kase, comp, metricKey)))
  const common = participants.length > 0 ? cases.filter((kase) => participants.every((comp) => caseSupported(kase, comp, metricKey))) : []
  return {participants, common}
}

/** Geometric mean of one competitor's `path` values over the given cases. For
 *  throughput (higher-is-better, ops) a 0/absent value means the case didn't run, so
 *  only positive values count. For typecost (count, lower-is-better) a value of 0 is
 *  REAL and the BEST outcome (a type that resolves with zero extra instantiations),
 *  so zeros are kept via +1 smoothing (geomean of value+1, minus 1) instead of being
 *  dropped: dropping them would compute the mean over only a library's EXPENSIVE
 *  cases and hide how often it's free (e.g. TypeBox is free on ~40% of cases, so a
 *  drop-zero geomean wrongly ranked it costlier than zod). Returns 0 when every
 *  measured value was 0, or null when there's no data (renders as n-a / —). */
export function geomeanOver(cases: AggregateCase[], metricKey: string, comp: string, path: AggregatePath, lowerBetter = false): number | null {
  const values: number[] = []
  let measured = false
  for (const kase of cases) {
    const result = kase.results[comp]?.[metricKey]
    if (result && result.status !== 'fail' && result.status !== 'not-supported' && typeof result[path] === 'number') {
      measured = true
      if (lowerBetter || result[path]! > 0) values.push(result[path]!)
    }
  }
  if (!measured) return null
  if (lowerBetter) return Math.exp(values.reduce((acc, value) => acc + Math.log(value + 1), 0) / values.length) - 1
  return geomean(values) ?? 0
}

/** A section as the aggregate reads it: its cases, plus the label and case-source
 *  path the chart shows above them. */
export interface AggregateSection {
  key: string
  label: string
  /** repo-relative file that authors this group's cases (the chart's GitHub link) */
  source?: string
  cases: AggregateCase[]
}

/** One summary row: a geometric mean per competitor over one section, or over every
 *  case (the `__overall__` row). */
export interface AggregateRow {
  key: string
  label: string
  source?: string
  values: Record<string, Record<AggregatePath, number | null>>
}

/** The per-section geometric means plus a final `__overall__` row over every case.
 *
 *  Two bases, because the two kinds of metric fail differently. A lower-is-better
 *  count (typecost) uses a PER-COMPETITOR basis: each library is averaged over the
 *  cases it supports, its own n-a cases drop out, and a library that supports
 *  nothing renders n-a. Throughput uses a COMMON basis: every participant over the
 *  same cases they all support, so a library that skips the slow cases cannot look
 *  faster than one that runs them. */
export function aggregateRows(
  sections: AggregateSection[],
  competitors: string[],
  metricKey: string,
  lowerBetter = false
): AggregateRow[] {
  const paths: AggregatePath[] = ['valid', 'invalid', 'mixed']
  const valuesOver = (cases: AggregateCase[]): AggregateRow['values'] => {
    const values: AggregateRow['values'] = {}
    const means = (basis: AggregateCase[], comp: string) =>
      Object.fromEntries(paths.map((path) => [path, geomeanOver(basis, metricKey, comp, path, lowerBetter)])) as Record<
        AggregatePath,
        number | null
      >
    if (lowerBetter) {
      for (const comp of competitors) values[comp] = means(cases, comp)
      return values
    }
    const {participants, common} = commonBasis(cases, competitors, metricKey)
    for (const comp of competitors) {
      values[comp] = participants.includes(comp) ? means(common, comp) : {valid: null, invalid: null, mixed: null}
    }
    return values
  }

  const rows: AggregateRow[] = sections.map((section) => ({
    key: section.key,
    label: section.label,
    source: section.source,
    values: valuesOver(section.cases),
  }))
  rows.push({key: '__overall__', label: 'Overall', values: valuesOver(sections.flatMap((section) => section.cases))})
  return rows
}
