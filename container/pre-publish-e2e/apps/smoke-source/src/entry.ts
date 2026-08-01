// smoke-source — a SOURCE-FIRST consumer. Its tsconfig sets
// customConditions:["source"], so the published @ts-runtypes/core resolves to its
// own src/ and the RT plugin's whole-program scan walks the library's internal
// generic definitions. Those are not consumer call sites; the resolver's
// first-party diagnostic scoping (program.IsSourceFileFromExternalLibrary) drops
// their diagnostics. Without it this app's build halts with the library's own
// CTA001/CTA003 — the exact regression this app guards.
export {selfCheck} from '../../shared/src/minimal';
