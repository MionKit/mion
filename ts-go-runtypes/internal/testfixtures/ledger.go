package testfixtures

// The @acme/ledger fixture: a class with TS private members, read from source, from a plain tsc .d.ts or from a
// mion-compiled one. Shared by the resolver's MKR016 tests and batchcompile's round trip.

// LedgerStaticSite reads Account with the static getRunTypeId<T>() call shape.
const LedgerStaticSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
export const id = getRunTypeId<Account>();
`

// LedgerValueSite reads Account with the value-first getRunTypeId(value) call shape.
const LedgerValueSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const account: Account;
export const id = getRunTypeId(account);
`

const LedgerPackageJSON = `{"name": "@acme/ledger", "version": "1.0.0", "types": "./dist/index.d.ts"}`
