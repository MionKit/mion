// What a consumer asking for `customConditions: ["source"]` resolves: real TypeScript, which
// the plugin's whole-program scan walks like first-party code. The non-literal CompTimeArgs
// call below is deliberate — it mirrors registerPureFnFactory in @mionjs/run-types's own
// sources, and a dependency's internals are not consumer call sites, so its CTA001/CTA003
// must be dropped. Without that scoping this app's build halts on a library's own code.
import type {CompTimeArgs} from '@mionjs/run-types';

export interface SrcTypedUser {
  id: number;
  label: string;
  since: Date;
}

export declare function registerThing(name: CompTimeArgs<string>): void;

const internalName: string = ('src-types' + String(1)) as string;
registerThing(internalName);
