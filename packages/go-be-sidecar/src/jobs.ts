// Runs the JS-regex jobs the Go resolver cannot: RE2 has no lookarounds or backreferences and
// diverges from JS semantics even on the shared syntax. Pure functions, so tests need no process;
// the stdio shell (index.ts) and the WASM host hook (hook.ts) are the only I/O layers, and both go
// through handleRequestLine so they cannot drift.
import RandExp from 'randexp';

export interface SidecarJob {
  id: number;
  op: string;
  source: string;
  flags?: string;
  // validate
  samples?: readonly string[];
  // generate
  count?: number;
  seed?: number;
  maxAttempts?: number;
  minLength?: number;
  maxLength?: number;
}

export interface SidecarResult {
  id: number;
  // The pattern failed `new RegExp`, a regex syntax error in the user's type (Go surfaces FMT002).
  compileError?: string;
  // Out of match budget on the quiet retry too: catastrophic backtracking, or a saturated host.
  // Its own channel, never `compileError`: Go surfaces the TRANSIENT FMT007 and never caches it.
  timedOut?: string;
  // validate: samples that do NOT match the compiled pattern (Go surfaces FMT001).
  offenders?: string[];
  // generate: deterministic values, deduped; may be fewer than requested for finite languages.
  values?: string[];
  // generate: pattern compiles but randexp threw, or no draw survived the self-check (Go: FMT005).
  generateError?: string;
  // Protocol-level failure (unknown op); Go treats it as an engine error.
  error?: string;
}

interface SidecarRequest {
  v: number;
  jobs?: readonly SidecarJob[];
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// JSON.stringify leaves U+2028/U+2029 raw, but newline-framed readers see them as line breaks;
// escape both, as Go's encoding/json does on the request side.
function encodeLine(value: unknown): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join('\\u2028').split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

// The whole request/response contract, shared by the stdio shell and the WASM host hook.
export function handleRequestLine(line: string): string {
  try {
    const request = JSON.parse(line) as SidecarRequest;
    return encodeLine({v: 1, results: runJobs(request.jobs ?? [])});
  } catch (err) {
    return encodeLine({v: 1, error: err instanceof Error ? err.message : String(err)});
  }
}

export function runJobs(jobs: readonly SidecarJob[]): SidecarResult[] {
  matchRetriesLeft = MATCH_RETRIES_PER_BATCH;
  return jobs.map(runJob);
}

function runJob(job: SidecarJob): SidecarResult {
  if (job.op === 'validate') return runValidate(job);
  if (job.op === 'generate') return runGenerate(job);
  return {id: job.id, error: `unknown op ${JSON.stringify(job.op)}`};
}

// Strip g/y: `.test` advances lastIndex, the same guard registerFormatPattern applies.
function statelessFlags(flags: string | undefined): string {
  return (flags ?? '').replace(/[gy]/g, '');
}

// A backtracking pattern wedges this single-threaded runner: the resolver times out, kills the
// child and drops pattern checks for the rest of the build.
// The guard cannot live here, this module is shared with the browser hook, whose contract is a
// SYNCHRONOUS host callback; a host that CAN bound a match installs its own matcher instead.
export const MATCH_TIMED_OUT = Symbol('match-timed-out');

// Per-sample budgets a bounding host applies; the retry budget is what a starved match finishes on.
// Both together stay well under the resolver's 5 s round-trip timeout, which a job must never hit.
export const MATCH_BUDGET_MS = 250;
export const MATCH_RETRY_BUDGET_MS = 2000;

export type PatternMatcher = (tester: RegExp, sample: string, budgetMs: number) => boolean | typeof MATCH_TIMED_OUT;

let matchSample: PatternMatcher = (tester, sample) => tester.test(sample);

export function setPatternMatcher(matcher: PatternMatcher): void {
  matchSample = matcher;
}

// The budget is WALL-clock, so ONE timeout does not prove backtracking: under load a trivial
// `.test` has been descheduled past it. A timed-out sample is judged again on the quiet budget,
// capped per batch so a batch of real runaways still answers inside Go's round-trip timeout.
export const MATCH_RETRIES_PER_BATCH = 2;
let matchRetriesLeft = MATCH_RETRIES_PER_BATCH;

// The one place a sample is judged; hosts that cannot bound a match never time out, so they see one call.
function boundedMatch(tester: RegExp, sample: string): boolean | typeof MATCH_TIMED_OUT {
  const first = matchSample(tester, sample, MATCH_BUDGET_MS);
  if (first !== MATCH_TIMED_OUT || matchRetriesLeft <= 0) return first;
  matchRetriesLeft--;
  return matchSample(tester, sample, MATCH_RETRY_BUDGET_MS);
}

// Reported as timedOut, never as `error`: `error` makes Go kill the sidecar and drop pattern checks for the build.
function runawayMessage(sample: string): string {
  const size = [...sample].length;
  return `pattern evaluation timed out on a ${size}-character sample; the pattern may backtrack catastrophically`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// randexp renders `\p{Letter}` as literal text, so every draw fails the self-check; each escape is
// swapped for a class of characters the regex engine itself says satisfy it, no Unicode table here.
// Inside an existing class the members are spliced in bare, a nested `[...]` would not parse.
// The TESTER keeps the ORIGINAL source, so an approximation that drifts only costs an unlucky draw.
const PROPERTY_ESCAPE = /\\[pP]\{[^}]*\}/;
// One character per family real schemas select on: latin, digits, punctuation/space, accented
// latin, greek, cyrillic, arabic, hebrew, han, hiragana, hangul, and a non-ASCII digit.
const PROPERTY_ALPHABET = 'aQz09 _-.,éßπΩЖДاבּ中日ひカ한٣';

function classEscape(char: string): string {
  return '\\^]-'.includes(char) ? '\\' + char : char;
}

function expandPropertyEscapes(source: string): string {
  let out = '';
  let rest = source;
  let inClass = false;
  while (rest.length > 0) {
    if (rest[0] === '\\') {
      const property = PROPERTY_ESCAPE.exec(rest);
      if (property && property.index === 0) {
        out += expandOneProperty(property[0], inClass);
        rest = rest.slice(property[0].length);
        continue;
      }
      out += rest.slice(0, 2);
      rest = rest.slice(2);
      continue;
    }
    if (rest[0] === '[') inClass = true;
    else if (rest[0] === ']') inClass = false;
    out += rest[0];
    rest = rest.slice(1);
  }
  return out;
}

function expandOneProperty(escape: string, inClass: boolean): string {
  let probe: RegExp;
  try {
    probe = new RegExp(escape, 'u');
  } catch {
    return escape;
  }
  // oxlint-disable-next-line typescript/no-misused-spread
  const members = [...PROPERTY_ALPHABET].filter((char) => probe.test(char)).map(classEscape);
  if (members.length === 0) return escape;
  return inClass ? members.join('') : '[' + members.join('') + ']';
}

function runValidate(job: SidecarJob): SidecarResult {
  let tester: RegExp;
  try {
    tester = new RegExp(job.source, statelessFlags(job.flags));
  } catch (err) {
    return {id: job.id, compileError: errorMessage(err)};
  }
  const offenders: string[] = [];
  for (const sample of job.samples ?? []) {
    const verdict = boundedMatch(tester, sample);
    if (verdict === MATCH_TIMED_OUT) return {id: job.id, timedOut: runawayMessage(sample)};
    if (!verdict) offenders.push(sample);
  }
  return offenders.length > 0 ? {id: job.id, offenders} : {id: job.id};
}

// The same seeded PRNG the fuzz harness uses; drives randexp's `randInt` so a seed pins the value stream.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The SELF-CHECK is load-bearing: randexp is lenient with impossible constructs, so a candidate can
// fail the pattern it was generated from. Each attempt draws a NEW value from the seeded stream, so
// generateError only after the whole budget (count x patternSampleRetries, computed Go-side).
function runGenerate(job: SidecarJob): SidecarResult {
  const flags = statelessFlags(job.flags);
  let tester: RegExp;
  try {
    tester = new RegExp(job.source, flags);
  } catch (err) {
    return {id: job.id, compileError: errorMessage(err)};
  }
  let generator: RandExp;
  try {
    generator = new RandExp(expandPropertyEscapes(job.source), flags);
  } catch (err) {
    return {id: job.id, generateError: errorMessage(err)};
  }
  const count = Math.max(1, job.count ?? 1);
  const maxAttempts = Math.max(count, job.maxAttempts ?? count * 10);
  const minLength = Math.max(0, job.minLength ?? 0);
  const maxLength = Math.max(0, job.maxLength ?? 0); // 0 = unbounded
  const random = mulberry32(job.seed ?? 0);
  generator.randInt = (from, to) => from + Math.floor(random() * (to - from + 1));
  // Bound infinite quantifiers: randexp's own default of 100 makes mock values huge.
  generator.max = Math.min(maxLength > 0 ? maxLength : 10, 100);
  const values = new Set<string>();
  for (let attempt = 0; attempt < maxAttempts && values.size < count; attempt++) {
    let candidate: string;
    try {
      candidate = generator.gen();
    } catch (err) {
      return {id: job.id, generateError: errorMessage(err)};
    }
    const verdict = boundedMatch(tester, candidate);
    if (verdict === MATCH_TIMED_OUT) return {id: job.id, timedOut: runawayMessage(candidate)};
    if (!verdict) continue;
    // Code points, matching the bounds the emitted validator checks.
    const size = [...candidate].length;
    if (size < minLength) continue;
    if (maxLength > 0 && size > maxLength) continue;
    values.add(candidate);
  }
  if (values.size === 0) {
    return {id: job.id, generateError: `no values matching the pattern and its length bounds survived ${maxAttempts} attempts`};
  }
  return {id: job.id, values: [...values]};
}
