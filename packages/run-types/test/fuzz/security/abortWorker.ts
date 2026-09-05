// A stand-in for securityWorker.ts, forked by the unit test instead of the real
// worker: it reports one attack and then dies with a bare SIGABRT, printing
// nothing on stderr.
//
// That is exactly what a heap-capped child looks like on a host where V8's
// "JavaScript heap out of memory" banner never reaches the parent (macOS with
// Node 26), so it pins the host's rule that such a death is an out-of-memory,
// on every host and without needing to fill a real heap.
//
// Erasable TypeScript, like the real worker: Node loads it with native type
// stripping, so the import below must stay type-only.

import type {SecurityJob, ReadyMessage, StepMessage} from './securityWorker.ts';

const send = process.send?.bind(process);
if (send) {
  process.on('message', (job: SecurityJob) => {
    if (job.type !== 'prefix-control') return;
    const step = {type: 'step', jobId: job.jobId, attack: job.attacks[0].id} satisfies StepMessage;
    // Raise the signal rather than process.abort(), which prints a Node stack;
    // the small delay lets the parent read the step off the channel first.
    send(step, () => setTimeout(() => process.kill(process.pid, 'SIGABRT'), 50));
  });
  send({type: 'ready'} satisfies ReadyMessage);
}
