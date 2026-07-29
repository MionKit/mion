// Sidecar job runner: executes JS-regex jobs the Go resolver cannot run
// itself (RE2 has no lookarounds or backreferences, and diverges from JS
// semantics even on the shared syntax). Pure function so the unit tests
// cover it without spawning a process; the stdio shell in index.ts is the
// only I/O layer. The `op` strings are open-ended on purpose: the
// mockSamples autogeneration todo adds a `generate` op without reshaping
// the protocol.

export interface SidecarJob {
  id: number;
  op: string;
  source: string;
  flags?: string;
  samples?: readonly string[];
}

export interface SidecarResult {
  id: number;
  // The pattern failed `new RegExp` — a regex syntax error in the user's
  // type definition (Go surfaces it as FMT002).
  compileError?: string;
  // Samples that do NOT match the compiled pattern (Go surfaces FMT001).
  offenders?: string[];
  // Protocol-level failure (unknown op); Go treats it as an engine error.
  error?: string;
}

export function runJobs(jobs: readonly SidecarJob[]): SidecarResult[] {
  return jobs.map(runJob);
}

function runJob(job: SidecarJob): SidecarResult {
  if (job.op !== 'validate') return {id: job.id, error: `unknown op ${JSON.stringify(job.op)}`};
  let tester: RegExp;
  try {
    // Strip g/y: `.test` advances lastIndex on global/sticky regexes — the
    // same statefulness guard registerFormatPattern applies at module load.
    tester = new RegExp(job.source, (job.flags ?? '').replace(/[gy]/g, ''));
  } catch (err) {
    return {id: job.id, compileError: err instanceof Error ? err.message : String(err)};
  }
  const offenders = (job.samples ?? []).filter((sample) => !tester.test(sample));
  return offenders.length > 0 ? {id: job.id, offenders} : {id: job.id};
}
