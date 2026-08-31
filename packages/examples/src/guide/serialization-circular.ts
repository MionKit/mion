import {createJsonEncoderFn, createBinaryEncoderFn, CircularReferenceError} from '@mionjs/run-types';

// A self-referential shape: a node that can point at another Node.
interface Node {
  name: string;
  next?: Node;
}

// A value that points at itself. Encoding this without a guard recurses
// until the stack overflows.
const cyclic: {name: string; next?: unknown} = {name: 'a'};
cyclic.next = cyclic;

// start-per-call
// Arm the guard for THIS encoder only. The encoder throws a
// `CircularReferenceError` instead of recursing forever.
const encode = createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});

try {
  encode(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
  (err as CircularReferenceError).path; // ['next']: where the back-edge was found
}
// end-per-call

// start-binary
// The binary encoder arms the same way. `rejectCircularRefs` is a compile-time
// option, so the armed encoder is a separate compiled function that bakes the
// cycle check into its body (you only pay for it where you ask for it).
const encodeBin = createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
try {
  encodeBin(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
}
// end-binary

// start-dag
// Shared-but-acyclic values pass: `shared` is reached twice, but never
// through itself, so the guard stays quiet.
const shared: Node = {name: 'shared'};
const dag: Node[] = [
  {name: 'root', next: shared},
  {name: 'alt', next: shared},
];

const encodeList = createJsonEncoderFn<Node[]>(undefined, {rejectCircularRefs: true});
encodeList(dag); // encodes normally, no cycle
// end-dag

export {encode, encodeBin, encodeList};
