// Entry for the runtime lane: run the shared checks and print the report as one
// JSON line. There is no dist to import, so the node-side assertions read this.
import {selfCheck} from './entry.ts';

const report = selfCheck();
console.log('MION_PRELOAD_REPORT ' + JSON.stringify(report));
if (!report.ok) process.exit(1);
