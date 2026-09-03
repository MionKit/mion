// Parent side of the heap-capped child process (securityWorker.ts): forks it
// with a V8 old-space cap, posts one job at a time over IPC, and turns the two
// failure shapes no in-process oracle can see into crash records that carry
// the attack and the seed:
//
//   out of memory   the child dies (V8's fatal "JavaScript heap out of memory"
//                   on stderr, SIGABRT or a non-zero exit); the last `step`
//                   message names the attack.
//   never returns   a step that runs past `stepTimeoutMs` is a hang or a
//                   super-linear decode; the child is killed and replaced.
//
// After either, a fresh child is forked so the run keeps hunting and the next
// job is attributed on its own. A process, not a worker thread: see the note
// in securityWorker.ts (a fatal V8 allocation failure takes a thread's whole
// process down, heap cap or not).

import {fork, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {SecurityJob, SecurityJobInput, WorkerMessage, DoneMessage} from './securityWorker.ts';

export interface WorkerCrash {
  seed: number;
  attack: string;
  message: string;
}

export interface JobResult {
  done?: DoneMessage;
  crash?: WorkerCrash;
}

export interface WorkerHostOptions {
  /** V8 old-generation cap for the child, in MB (`--max-old-space-size`). **/
  heapMb: number;
  /** A single attack that runs longer than this is a hang. **/
  stepTimeoutMs: number;
}

export const DEFAULT_WORKER_OPTIONS: WorkerHostOptions = {heapMb: 256, stepTimeoutMs: 10_000};

const WORKER_PATH = fileURLToPath(new URL('./securityWorker.ts', import.meta.url));
const STDERR_TAIL = 2000;

interface Child {
  process: ChildProcess;
  ready: Promise<void>;
  stderr: string;
}

export class SecurityWorkerHost {
  private child: Child | null = null;
  private nextJobId = 1;
  readonly options: WorkerHostOptions;

  constructor(options: Partial<WorkerHostOptions> = {}) {
    this.options = {...DEFAULT_WORKER_OPTIONS, ...options};
  }

  /** Run one job. Resolves with the child's report, or a crash record when
   *  the child died or hung; never rejects for a job-level failure. **/
  async run(job: SecurityJobInput): Promise<JobResult> {
    const jobId = this.nextJobId++;
    const full = {...job, jobId} as SecurityJob;
    const child = this.ensureChild();
    try {
      await child.ready;
    } catch (err) {
      this.discard(child);
      return {
        crash: {
          seed: job.seed,
          attack: '(before the first attack)',
          message: `child failed to start: ${(err as Error).message}${tail(child)}`,
        },
      };
    }
    return new Promise<JobResult>((resolve) => {
      let lastAttack = '(before the first attack)';
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (result: JobResult): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        child.process.off('message', onMessage);
        child.process.off('error', onError);
        child.process.off('exit', onExit);
        resolve(result);
      };
      const crash = (message: string): void => {
        this.discard(child);
        finish({crash: {seed: job.seed, attack: lastAttack, message}});
      };
      const arm = (): void => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(
          () => crash(`attack did not return within ${this.options.stepTimeoutMs}ms (hang or super-linear decode)`),
          this.options.stepTimeoutMs
        );
      };
      const onMessage = (message: WorkerMessage): void => {
        if (message.type === 'ready' || message.jobId !== jobId) return;
        if (message.type === 'step') {
          lastAttack = message.attack;
          arm();
        } else if (message.type === 'done') finish({done: message});
        else crash(`child failed before attacking: ${message.message}`);
      };
      const onError = (err: Error): void => crash(`child error: ${err.message}${tail(child)}`);
      const onExit = (code: number | null, signal: string | null): void => {
        const oom = /heap out of memory|Allocation failed/i.test(child.stderr);
        crash(
          oom
            ? `out of memory (heap cap ${this.options.heapMb}MB, exit ${code ?? signal})${tail(child)}`
            : `child exited (${code ?? signal}) mid-attack${tail(child)}`
        );
      };
      child.process.on('message', onMessage);
      child.process.on('error', onError);
      child.process.on('exit', onExit);
      arm();
      child.process.send(full);
    });
  }

  close(): void {
    if (this.child) this.discard(this.child);
  }

  private ensureChild(): Child {
    if (this.child) return this.child;
    const process = fork(WORKER_PATH, [], {
      execArgv: [`--max-old-space-size=${this.options.heapMb}`],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const child: Child = {process, ready: Promise.resolve(), stderr: ''};
    process.stderr?.on('data', (chunk: Buffer) => {
      child.stderr = (child.stderr + chunk.toString()).slice(-STDERR_TAIL);
    });
    child.ready = new Promise<void>((resolve, reject) => {
      const onMessage = (message: WorkerMessage): void => {
        if (message.type !== 'ready') return;
        process.off('message', onMessage);
        process.off('exit', onExit);
        resolve();
      };
      const onExit = (code: number | null): void => reject(new Error(`exited with ${code} before it was ready`));
      process.on('message', onMessage);
      process.on('exit', onExit);
    });
    child.ready.catch(() => {});
    this.child = child;
    return child;
  }

  private discard(child: Child): void {
    if (this.child === child) this.child = null;
    child.process.removeAllListeners();
    if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill('SIGKILL');
  }
}

function tail(child: Child): string {
  const text = child.stderr.trim();
  if (!text) return '';
  const last = text
    .split('\n')
    .filter((line) => /FATAL|out of memory|Error/i.test(line))
    .slice(-3)
    .join(' | ');
  return last ? ` [stderr: ${last}]` : '';
}
