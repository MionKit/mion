// What a consumer asking for the `source` condition resolves. The non-literal CompTimeArgs call
// below is deliberate: it mirrors registerPureFnFactory in @mionjs/run-types, and a dependency's
// internals are not consumer call sites, so its CTA001/CTA003 must be dropped or the build halts.
import type {CompTimeArgs} from '@mionjs/run-types';

export interface SrcTypedUser {
  id: number;
  label: string;
  since: Date;
}

export declare function registerThing(name: CompTimeArgs<string>): void;

const internalName: string = ('src-types' + String(1)) as string;
registerThing(internalName);
