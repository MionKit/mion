import './setup.ts'; // install the Temporal polyfill global BEFORE any case runs
import '@ts-runtypes/core/formats'; // register built-in format patterns (side effect)
import {cases} from './cases.ts';
import {specCases} from './specCases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';
import {maybeAudit} from '../../shared/harness/audit.ts';
import {maybeSpecConformance} from '../../shared/harness/spec.ts';

maybeSpecConformance('ts-runtypes', specCases); // RT_SPEC_CONFORMANCE=1: run the JSON Schema spec corpus + exit
maybeAudit('ts-runtypes', cases); // RT_AUDIT_ALIGNMENT=1: emit alignment records + exit, skipping the timing bench
const result = runCompetitor({name: 'ts-runtypes', cases});
writeResult(result);
process.exit(result.summary.fail + result.summary.errored ? 1 : 0);
