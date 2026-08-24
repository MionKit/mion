// Family 6 — Serialization edge. Mirrors guide/serialization-circular.ts +
// custom-class-serializer.ts. A per-call circular guard throws, and a
// registered class serializer rebuilds a real instance on decode.
import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  CircularReferenceError,
  registerClassSerializer,
  type DataOnly,
} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface Node {
  name: string;
  next?: Node;
}

// A class with a non-empty constructor: data rides structurally, deserialize
// rebuilds the real instance.
export class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
  format(): string {
    return `${(this.amount / 100).toFixed(2)} ${this.currency}`;
  }
}
registerClassSerializer(Money, {deserialize: (data: DataOnly<Money>) => new Money(data.amount, data.currency)});

interface Account {
  id: string;
  balance: Money;
}

export const encodeNode = createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
export const encodeNodeBin = createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
export const encodeAccount = createJsonEncoderFn<Account>();
export const decodeAccount = createJsonDecoderFn<Account>();

export function checkSerializationEdge(): CheckResult[] {
  const cyclic: {name: string; next?: unknown} = {name: 'a'};
  cyclic.next = cyclic;

  let jsonGuardFired = false;
  let jsonPath: (string | number)[] | undefined;
  try {
    encodeNode(cyclic as Node);
  } catch (error) {
    jsonGuardFired = error instanceof CircularReferenceError;
    if (error instanceof CircularReferenceError) jsonPath = error.path;
  }
  let binGuardFired = false;
  try {
    encodeNodeBin(cyclic as Node);
  } catch (error) {
    binGuardFired = error instanceof CircularReferenceError;
  }

  const wire = encodeAccount({id: 'acc_1', balance: new Money(4999, 'USD')})!;
  const back = decodeAccount(wire);

  return [
    ok('serialization: JSON circular guard throws CircularReferenceError', jsonGuardFired),
    ok('serialization: circular error carries a path', Array.isArray(jsonPath) && jsonPath.length > 0),
    ok('serialization: binary circular guard throws too', binGuardFired),
    ok('serialization: custom class serializer rebuilds a real instance', back.balance instanceof Money && back.balance.format() === '49.99 USD'),
  ];
}
