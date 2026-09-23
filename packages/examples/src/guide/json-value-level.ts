import {
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
} from '@mionjs/run-types';

interface Invoice {
  id: bigint;
  dueAt: Date;
}

interface Customer {
  name: string;
  since: Date;
}

const prepareInvoice = createPrepareForJsonFn<Invoice>();
const prepareCustomer = createPrepareForJsonFn<Customer>();
const restoreInvoice = createRestoreFromJsonFn<Invoice>();
const restoreCustomer = createRestoreFromJsonFn<Customer>();

// your own envelope, one JSON.stringify
const body = JSON.stringify({
  invoice: prepareInvoice({
    id: 7n,
    dueAt: new Date('2024-06-01T00:00:00.000Z'),
  }),
  customer: prepareCustomer({
    name: 'Ana',
    since: new Date('2020-01-01T00:00:00.000Z'),
  }),
});

// one JSON.parse, then restore each value
const envelope = JSON.parse(body);
const invoice = restoreInvoice(envelope.invoice); // id is a bigint, dueAt is a Date
const customer = restoreCustomer(envelope.customer); // since is a Date

export {invoice, customer};
