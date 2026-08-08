import {cases} from './cases.ts';
import {specCases} from './specCases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';
import {maybeAudit} from '../../shared/harness/audit.ts';
import {maybeSpecConformance} from '../../shared/harness/spec.ts';

maybeSpecConformance('ajv', specCases); // RT_SPEC_CONFORMANCE=1: run the JSON Schema spec corpus + exit
maybeAudit('ajv', cases); // RT_AUDIT_ALIGNMENT=1: emit alignment records + exit, skipping the timing bench
const result = runCompetitor({name: 'ajv', cases});
writeResult(result);
// ERRORED only: a builder that threw means this lane did not really run. A `fail`
// is a correctness DIVERGENCE from the shared samples, expected for several
// competitors and recorded by the Correctness page (see shared/harness/result.ts).
process.exit(result.summary.errored ? 1 : 0);
