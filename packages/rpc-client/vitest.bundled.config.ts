import {laneVitestConfig} from './test/lib/laneConfig.ts';

// Spelled out: the test-batches check reads the name from this file as text.
export default laneVitestConfig({name: 'client-bundled'});
