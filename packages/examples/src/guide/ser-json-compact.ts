import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

// start-compact
type Point = {x: number; y: number; label?: string | null};

const encodePoint = createJsonEncoderFn<Point>(undefined, {
  strategy: 'compact',
});
const decodePoint = createJsonDecoderFn<Point>(undefined, {
  strategy: 'compact',
});

const json = encodePoint({x: 1, y: 2}); // '[1,2,null]': no key names
const point = decodePoint(json!); // {x: 1, y: 2}

encodePoint({x: 1, y: 2, label: null}); // also '[1,2,null]', so null decodes as absent
// end-compact

export {json, point};
