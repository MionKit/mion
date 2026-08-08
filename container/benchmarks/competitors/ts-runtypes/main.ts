import './setup.ts'; // install the Temporal polyfill global BEFORE any case runs
import '@ts-runtypes/core/formats'; // register built-in format patterns (side effect)
import {cases} from './cases.ts';
import {specCases} from './specCases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';
import {maybeAudit} from '../../shared/harness/audit.ts';
import {maybeSpecConformance} from '../../shared/harness/spec.ts';
import {assertEngineBranch} from './engineBranch.ts';

maybeSpecConformance('ts-runtypes', specCases); // RT_SPEC_CONFORMANCE=1: run the JSON Schema spec corpus + exit
maybeAudit('ts-runtypes', cases); // RT_AUDIT_ALIGNMENT=1: emit alignment records + exit, skipping the timing bench
// Throws when the live rt::countEnumKeys counter is not the one this engine must
// select — so a Bun lane that silently ran node, or a deleted branch, fails the
// bench instead of quietly publishing numbers that mean something else. Runs after
// the audit/spec early-exits (which never time anything) and before the bench, so
// the failure is cheap and loud.
const engineBranch = assertEngineBranch();
const result = runCompetitor({name: 'ts-runtypes', cases});
writeResult({...result, engineBranch});
// ERRORED only: a builder that threw means this lane did not really run. A `fail`
// is a correctness DIVERGENCE from the shared samples, expected for several
// competitors and recorded by the Correctness page (see shared/harness/result.ts).
process.exit(result.summary.errored ? 1 : 0);
