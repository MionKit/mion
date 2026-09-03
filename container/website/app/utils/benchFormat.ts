// How a benchmark number, a library version and a build strategy are written, in one
// place. BenchTable (the full tables) and RuntypesBenchBars (the summary charts) read
// the same generated datasets, so a value must not read `1.2M/s` on one page and
// `1200000` on the other.

/** What a metric is measured in. `ops` is a rate, `count` a bare number, `bytes` a size. */
export type BenchUnit = 'ops' | 'count' | 'bytes' | undefined

/** One measured quantity of a dataset, as index.json declares it. */
export interface BenchMetric {
  key: string
  label: string
  /** the long sentence above the block ("… ops/sec, higher is better") */
  metricLabel?: string
  cellHint?: string
  /** overrides the dataset's own unit for this metric (serialization payload: bytes) */
  unit?: BenchUnit
  /** explicit direction; without it, counts and bytes are lower-is-better */
  lowerBetter?: boolean
  /** computed client-side rather than measured (the serialization round-trip) */
  derived?: string
}

/** A rounded, unit-aware number: `1.2M/s`, `340.5k`, `59 B`. `bare` drops the rate
 *  suffix for a secondary number that sits beside one already carrying it. */
export function formatValue(value: number, unit: BenchUnit, bare = false): string {
  if (unit === 'bytes') {
    if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)}MB`
    if (value >= 1_024) return `${(value / 1_024).toFixed(1)}KB`
    return `${Math.round(value)} B`
  }
  const suffix = bare || unit === 'count' ? '' : '/s'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M${suffix}`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k${suffix}`
  return `${Math.round(value)}${suffix}`
}

/** A metric's unit: its own when it declares one, else the dataset's. */
export function unitFor(metrics: BenchMetric[], datasetUnit: BenchUnit, metricKey: string): BenchUnit {
  return metrics.find((metric) => metric.key === metricKey)?.unit ?? datasetUnit
}

/** Which direction wins for a metric: what it declares, else counts and bytes are
 *  lower-is-better and everything else higher. */
export function lowerBetterFor(metrics: BenchMetric[], datasetUnit: BenchUnit, metricKey: string): boolean {
  const metric = metrics.find((entry) => entry.key === metricKey)
  if (metric?.lowerBetter != null) return metric.lowerBetter
  const unit = unitFor(metrics, datasetUnit, metricKey)
  return unit === 'count' || unit === 'bytes'
}

/** When a library builds its validator: at build time, on first use, or never
 *  (walked per call). Shown as a tag under the competitor's name. */
export function strategyOf(competitor: string): 'comptime' | 'jit' | 'interpreted' {
  const name = competitor.toLowerCase()
  if (name.includes('typia') || name.includes('ts-go') || name.includes('mion')) return 'comptime'
  if (name.includes('ajv') || name.includes('typebox')) return 'jit'
  return 'interpreted'
}

/** major.minor, the axis releases actually move on. Exception: for a 0.x package the
 *  patch IS that axis (semver reads 0.minor.patch as breaking.feature), so a non-zero
 *  patch is kept, e.g. typebox 0.34.49. */
export function shortVersion(version: string | undefined): string {
  if (!version) return ''
  const parts = version.split('.')
  const [major, minor] = parts
  if (minor === undefined) return major ?? ''
  if (major === '0') {
    const patch = parts[2]?.match(/^\d+/)?.[0]
    if (patch && Number(patch) !== 0) return `${major}.${minor}.${patch}`
  }
  return `${major}.${minor}`
}
