import {laneVitestConfig} from './test/lib/laneConfig.ts';

// The name is spelled out here because the test-batches check reads it from this file as text.
export default laneVitestConfig({mode: 'mixed', name: 'client-mixed'});
