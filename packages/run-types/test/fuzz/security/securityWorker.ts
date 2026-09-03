// The heap-capped CHILD PROCESS the secbinary lane runs every decode in.
//
// The parent (securityWorkerHost.ts) compiles a random type through the
// resolver and posts one job per type over IPC: the rendered entry modules,
// the valid wire, the seed and the attack budget. This process rebuilds the
// factories from the entry-module text (the same evaluator the inline harness
// uses), maps the wire with an instrumented deserializer, generates the blind
// and the dictionary attacks, and runs the binary oracles over each. Before
// every decode it posts a `step` with the attack id, so when the heap cap
// kills it or a decode never returns, the host records a crash carrying the
// exact attack and seed, and the vitest process survives to keep hunting.
//
// A process, not a worker thread, on purpose: a `worker_threads` Worker with
// `resourceLimits` reports a gentle out-of-memory as ERR_WORKER_OUT_OF_MEMORY,
// but the count bomb's failure mode is one giant table allocation, which V8
// treats as FATAL ("invalid table size Allocation failed - JavaScript heap out
// of memory") and takes the whole process down, vitest fork included. Only a
// process boundary contains that.
//
// A `prefix-control` job runs the same oracles over the PRE-FIX reader +
// array arm (prefixReader.ts) instead of a compiled decoder: the negative
// control that proves the lane catches the silent truncation and the count
// bomb.
//
// This file and everything it imports must be erasable TypeScript: Node loads
// it through native type stripping (the vitest transform is not available in
// a raw worker). The run-types package is reached through its BUILT dist by
// relative URL (the workspace has no self-link for the package, and the src
// tree is not strip-clean), so `pnpm run check:builds` is a prerequisite.

import {
  createValidateFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createDataViewDeserializer,
  type DataViewDeserializer,
} from '../../../dist/index.js';
import {evalEntryModules, instantiateRunTypes} from '../../../../devtools/test/helpers/entryModules.ts';
import {mulberry32} from '../core/seededRng.ts';
import {instrumentDeserializer, type WireRecord} from './wireMap.ts';
import {blindWireAttacks, dictionaryWireAttacks, type WireAttack} from './wireMutations.ts';
import {checkBinaryDecode, checkIsolation, type BinaryDecodeProbe, type SecurityViolation} from './securityOracle.ts';
import {createPreFixDeserializer, preFixStringArrayDecode, stringArrayEncode, stringArrayValidate} from './prefixReader.ts';

export interface BinaryJob {
  type: 'binary';
  jobId: number;
  seed: number;
  target: string;
  entryModules: Record<string, string>;
  /** Family tag → entry-module basename of the ROOT tuple (`val`, `tb`, `fb`).
   *  The modules carry a tuple per nested type too, so the tag alone is not
   *  enough: picking "the" fb by tag once attacked a nested Map decoder. **/
  rootKeys: Record<string, string>;
  wire: Uint8Array;
  /** Blind mutations to draw. **/
  blindCount: number;
  /** Wire-map records to attack with the dictionary (sampled past this). **/
  recordLimit: number;
}

export interface PrefixControlJob {
  type: 'prefix-control';
  jobId: number;
  seed: number;
  target: string;
  /** Attacks to run through the pre-fix reader. **/
  attacks: Array<{id: string; expect: 'reject' | 'any'; bytes: Uint8Array}>;
  /** The valid wire for the isolation check. **/
  validWire: Uint8Array;
}

export type SecurityJob = BinaryJob | PrefixControlJob;

/** A job as the host takes it: the worker assigns `jobId`. Distributive over
 *  the union so each job kind keeps its own fields. **/
export type SecurityJobInput = {[K in SecurityJob['type']]: Omit<Extract<SecurityJob, {type: K}>, 'jobId'>}[SecurityJob['type']];

export interface StepMessage {
  type: 'step';
  jobId: number;
  attack: string;
}

export interface DoneMessage {
  type: 'done';
  jobId: number;
  violations: SecurityViolation[];
  /** Attack id (without the `@offset`) → times applied. **/
  applied: Record<string, number>;
  /** Decode outcome ('returned' or the error name) → count. **/
  outcomes: Record<string, number>;
  decodes: number;
  /** Wire-map records the decoder made over the valid wire. **/
  records: number;
}

export interface FailMessage {
  type: 'fail';
  jobId: number;
  message: string;
}

export interface ReadyMessage {
  type: 'ready';
}

export type WorkerMessage = StepMessage | DoneMessage | FailMessage | ReadyMessage;

const send = process.send?.bind(process);
if (send) {
  process.on('message', (job: SecurityJob) => {
    try {
      send(runJob(job, (attack) => send({type: 'step', jobId: job.jobId, attack} satisfies StepMessage)));
    } catch (err) {
      send({
        type: 'fail',
        jobId: job.jobId,
        message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      } satisfies FailMessage);
    }
  });
  send({type: 'ready'});
}

/** Run one job to completion (exported for the in-thread unit tests). **/
export function runJob(job: SecurityJob, onStep: (attack: string) => void): DoneMessage {
  return job.type === 'binary' ? runBinaryJob(job, onStep) : runPrefixControl(job, onStep);
}

function runBinaryJob(job: BinaryJob, onStep: (attack: string) => void): DoneMessage {
  const tuples = evalEntryModules(job.entryModules);
  instantiateRunTypes(tuples);
  const byTag: Record<string, readonly unknown[]> = {};
  for (const tag of ['val', 'tb', 'fb']) {
    const tuple = tuples[job.rootKeys[tag]];
    if (!tuple || tuple[0] !== tag) throw new Error(`root ${tag} tuple missing (rootKeys ${JSON.stringify(job.rootKeys)})`);
    byTag[tag] = tuple;
  }
  const validate = createValidateFn(undefined, undefined, byTag.val as never) as (v: unknown) => boolean;
  const encode = createBinaryEncoderFn(undefined, undefined, byTag.tb as never) as (v: unknown) => Uint8Array;
  const decodeFn = createBinaryDecoderFn(undefined, undefined, byTag.fb as never) as (des: DataViewDeserializer) => unknown;

  const probe: BinaryDecodeProbe = {
    decode: (bytes) => {
      const des = createDataViewDeserializer('security', bytes);
      const value = decodeFn(des);
      return {value, index: des.index, byteLength: bytes.byteLength};
    },
    validate,
    encode,
  };

  // The wire map: what the decoder reads, where, over the valid wire.
  const mapped = createDataViewDeserializer('security-map', job.wire);
  const records = instrumentDeserializer(mapped);
  decodeFn(mapped);

  const rng = mulberry32(job.seed);
  const attacks: WireAttack[] = blindWireAttacks(job.wire, rng, job.blindCount);
  for (const record of sampleRecords(records, job.recordLimit, rng)) attacks.push(...dictionaryWireAttacks(job.wire, record));
  return runAttacks(job, probe, attacks, job.wire, onStep, records.length);
}

function runPrefixControl(job: PrefixControlJob, onStep: (attack: string) => void): DoneMessage {
  const probe: BinaryDecodeProbe = {
    decode: (bytes) => {
      const des = createPreFixDeserializer(bytes);
      const value = preFixStringArrayDecode(des);
      return {value, index: des.index, byteLength: des.byteLength};
    },
    validate: stringArrayValidate,
    encode: (value) => stringArrayEncode(value as string[]),
  };
  return runAttacks(job, probe, job.attacks, job.validWire, onStep, 0);
}

function runAttacks(
  job: SecurityJob,
  probe: BinaryDecodeProbe,
  attacks: Array<{id: string; expect: 'reject' | 'any'; bytes: Uint8Array}>,
  validWire: Uint8Array,
  onStep: (attack: string) => void,
  records: number
): DoneMessage {
  const ctx = {target: job.target, seed: job.seed};
  const violations: SecurityViolation[] = [];
  const applied: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  for (const attack of attacks) {
    onStep(attack.id);
    const result = checkBinaryDecode(probe, attack, ctx);
    violations.push(...result.violations);
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
    const family = attack.id.replace(/@\d+$/, '').replace(/\.\d+$/, '');
    applied[family] = (applied[family] ?? 0) + 1;
    const isolation = checkIsolation(probe, validWire, attack.id, ctx);
    if (isolation) violations.push(isolation);
  }
  return {type: 'done', jobId: job.jobId, violations, applied, outcomes, decodes: attacks.length, records};
}

function sampleRecords(records: WireRecord[], limit: number, rng: () => number): WireRecord[] {
  if (records.length <= limit) return records;
  const chosen = new Set<number>();
  while (chosen.size < limit) chosen.add(Math.floor(rng() * records.length));
  return [...chosen].sort((a, b) => a - b).map((i) => records[i]);
}
