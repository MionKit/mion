import {
  createJsonEncoderFn,
  createBinaryEncoderFn,
  CircularReferenceError,
} from '@mionjs/run-types';

interface Node {
  name: string;
  next?: Node;
}

// a value that points at itself
const cyclic: {name: string; next?: unknown} = {name: 'a'};
cyclic.next = cyclic;

// start-per-call
// only this encoder checks for cycles
const encode = createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});

try {
  encode(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
  (err as CircularReferenceError).path; // ['next']: where the back-edge was found
}
// end-per-call

// start-binary
const encodeBin = createBinaryEncoderFn<Node>(undefined, {
  rejectCircularRefs: true,
});
try {
  encodeBin(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
}
// end-binary

// start-dag
// `shared` is reached twice, but never through itself
const shared: Node = {name: 'shared'};
const dag: Node[] = [
  {name: 'root', next: shared},
  {name: 'alt', next: shared},
];

const encodeList = createJsonEncoderFn<Node[]>(undefined, {
  rejectCircularRefs: true,
});
encodeList(dag); // encodes normally, no cycle
// end-dag

export {encode, encodeBin, encodeList};
