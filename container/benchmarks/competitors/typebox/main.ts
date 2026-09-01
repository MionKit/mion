import {cases} from './cases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';
import {maybeAudit} from '../../shared/harness/audit.ts';

maybeAudit('typebox', cases); // MION_AUDIT_ALIGNMENT=1: emit alignment records + exit, skipping the timing bench
const result = runCompetitor({name: 'typebox', cases});
writeResult(result);
// ERRORED only: a builder that threw means this lane did not really run. A `fail`
// is a correctness DIVERGENCE from the shared samples, expected for several
// competitors and recorded by the Correctness page (see shared/harness/result.ts).
process.exit(result.summary.errored ? 1 : 0);
