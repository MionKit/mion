// Sidecar job runner: executes JS-regex jobs the Go resolver cannot run
// itself (RE2 has no lookarounds or backreferences, and diverges from JS
// semantics even on the shared syntax). Pure functions so the unit tests
// cover them without spawning a process; the stdio shell (index.ts) and
// the WASM host hook (hook.ts) are the only I/O layers, and both go
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
  // The pattern failed `new RegExp` — a regex syntax error in the user's
  // type definition (Go surfaces it as FMT002).
  compileError?: string;
  // validate: samples that do NOT match the compiled pattern (Go surfaces
  // FMT001).
  offenders?: string[];
  // generate: the deterministic sample values (deduped; may be fewer than
  // requested for small finite languages).
  values?: string[];
  // generate: the pattern compiles but no samples could be produced — an
  // unsupported construct made randexp throw, or the whole retry budget
  // yielded nothing that survives the self-check (Go surfaces FMT005).
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

// JSON.stringify leaves U+2028/U+2029 raw (legal inside JSON strings), but
// they look like line breaks to newline-framed JS readers. A response can
// echo them inside offender samples, so escape both — mirroring what Go's
// encoding/json does on the request side — and no reader on either end can
// ever see a bogus line break.
function encodeLine(value: unknown): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join('\\u2028').split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

// handleRequestLine is the whole request/response contract in one place:
// one request-line JSON in, one response-line JSON out. Shared by the
// stdio shell and the WASM host hook.
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

// Strip g/y: `.test` advances lastIndex on global/sticky regexes — the
// same statefulness guard registerFormatPattern applies at module load.
function statelessFlags(flags: string | undefined): string {
  return (flags ?? '').replace(/[gy]/g, '');
}

// A pattern can backtrack catastrophically — `(x|y)+.*.*` against a long run
// of `x` never returns from `.test` — and this runner is single-threaded, so
// one such job wedges the whole process: the request it arrived in is never
// answered and the resolver waits out its round-trip timeout, then kills the
// child and gives up on pattern checks for the rest of the build.
//
// The guard cannot live in this module. It is shared with the browser hook,
// whose contract is a SYNCHRONOUS host callback, and no host can interrupt a
// running match from inside its own thread. So a host that CAN bound one
// installs its own matcher (the stdio shell does, under a vm timeout); every
// other host keeps the plain test and behaves exactly as before.
export const MATCH_TIMED_OUT = Symbol('match-timed-out');

export type PatternMatcher = (tester: RegExp, sample: string) => boolean | typeof MATCH_TIMED_OUT;

let matchSample: PatternMatcher = (tester, sample) => tester.test(sample);

export function setPatternMatcher(matcher: PatternMatcher): void {
  matchSample = matcher;
}

// A host's match budget is WALL-clock (index.ts runs the test under a vm
// timeout): on a loaded machine the sidecar can be descheduled past the budget
// in the middle of a trivial `.test`, so ONE timeout does not prove the
// pattern backtracks (a convert-CLI fuzz replay running beside a parallel Go
// build flagged /^(\w+)-\1$/ on a 3-character sample). A genuine runaway times
// out again at once, so a timed-out match is retried, capped per batch so a
// batch of real runaways still answers inside Go's round-trip timeout.
export const MATCH_RETRIES_PER_BATCH = 2;
let matchRetriesLeft = MATCH_RETRIES_PER_BATCH;

function boundedMatch(tester: RegExp, sample: string): boolean | typeof MATCH_TIMED_OUT {
  let verdict = matchSample(tester, sample);
  while (verdict === MATCH_TIMED_OUT && matchRetriesLeft > 0) {
    matchRetriesLeft--;
    verdict = matchSample(tester, sample);
  }
  return verdict;
}

// Reported as compileError, never as `error`: `error` is the protocol channel
// and Go treats it as an engine failure, killing the sidecar and disabling
// pattern checks for the whole build. A pattern nobody can evaluate is one
// job's verdict, which is what FMT002 already says.
function runawayMessage(sample: string): string {
  const size = [...sample].length;
  return `pattern evaluation timed out on a ${size}-character sample; the pattern may backtrack catastrophically`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// randexp does not understand Unicode property escapes: it renders `\p{Letter}`
// as the literal text `p{Letter}`, so every draw fails the pattern's own
// self-check and the job dies with generateError. Those escapes are exactly
// what a `u`-mode pattern is for, and the JSON Schema door compiles every
// schema `pattern` in `u` mode, so before the GENERATOR sees the source each
// escape is swapped for a character class of characters that really do satisfy
// it — decided by the regex engine, so no Unicode table lives here. Inside an
// existing class the members are spliced in bare, since a nested `[...]` would
// not parse. The TESTER keeps compiling the ORIGINAL source, which is what
// makes this safe: an approximation that drifts just fails the self-check and
// the candidate is dropped, exactly as any other unlucky draw.
const PROPERTY_ESCAPE = /\\[pP]\{[^}]*\}/;
// One character per family the escapes in real schemas select on: latin (both
// cases), digits, punctuation/space, then accented latin, greek, cyrillic,
// arabic, hebrew, han, hiragana, hangul, and a non-ASCII digit.
const PROPERTY_ALPHABET = 'aQz09 _-.,éßπΩЖДاבּ中日ひカ한٣';

function classEscape(char: string): string {
  return '\\^]-'.includes(char) ? '\\' + char : char;
}

function expandPropertyEscapes(source: string): string {
  let out = '';
  let rest = source;
  let inClass = false;
  while (rest.length > 0) {
    // Copy escaped pairs verbatim unless the escape is the property one.
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
    if (verdict === MATCH_TIMED_OUT) return {id: job.id, compileError: runawayMessage(sample)};
    if (!verdict) offenders.push(sample);
  }
  return offenders.length > 0 ? {id: job.id, offenders} : {id: job.id};
}

// mulberry32: the same tiny seeded PRNG the fuzz harness uses. Drives
// randexp's documented `randInt` override so generation is fully
// deterministic per (seed) — same seed, same value stream, everywhere.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// runGenerate draws candidate values from randexp and keeps the ones that
// survive the SELF-CHECK: the real compiled regex plus the code-point length
// bounds. The self-check is load-bearing — randexp is lenient with
// impossible constructs (bad positionals are ignored, unknown backrefs
// yield empty strings), so a candidate can legitimately fail the pattern
// it was generated from. Each attempt draws a NEW value from the seeded
// stream, so retrying recovers unlucky draws; generateError only after
// the whole budget (count x patternSampleRetries, computed Go-side)
// yields nothing.
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
  // Bound infinite quantifiers: honor the declared maxLength when present,
  // otherwise keep mock values shortish (randexp's own default is 100).
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
    if (verdict === MATCH_TIMED_OUT) return {id: job.id, generateError: runawayMessage(candidate)};
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
