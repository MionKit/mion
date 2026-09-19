// Prints one JSON line between <<RT>> markers; run.mjs runs the built file under a fresh node and saves it.
import {registerPureFnFactory, getRTUtils, getRunTypeId} from '@mionjs/run-types';
import {isoDay} from '@acme/dates';
import {TITLE_ID} from './ids';

export const stamp = registerPureFnFactory(function (utl) {
  return function _stamp(label: string, day: string): string {
    return utl.getPureFn(isoDay)(label, day);
  };
});

type Tag = {label: string; day: string};
const sample: Tag = {label: 'x', day: 'y'};

const utl = getRTUtils();
const deps = utl.getCompiledPureFnByKey(stamp).pureFnDependencies;
const isoDayDeps = utl.getCompiledPureFnByKey(deps[0]).pureFnDependencies;
const report = {
  stampId: stamp,
  deps,
  result: utl.getPureFnByKey(stamp)('Hello World', '2026-09-18T10:00:00Z'),
  isoDayDeps,
  servedSlugifyCode: utl.getCompiledPureFnByKey(isoDayDeps[0]).code,
  titleStillOwnedByText: utl.hasPureFnByKey(TITLE_ID),
  staticId: getRunTypeId<Tag>(),
  valueId: getRunTypeId(sample),
};
console.log('<<RT>>' + JSON.stringify(report) + '<<RT>>');
