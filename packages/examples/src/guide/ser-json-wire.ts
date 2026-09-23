import {createJsonEncoderFn, type JSONShape} from '@mionjs/run-types';

// start-wire
type Reading = {
  id: bigint;
  at: Date;
  seen: Map<string, number>;
  note: string | Date;
};

const encodeReading = createJsonEncoderFn<Reading>();

const json = encodeReading({
  id: 7n,
  at: new Date(0),
  seen: new Map([['a', 1]]),
  note: 'ok',
});
// {"id":"7","at":"1970-01-01T00:00:00.000Z","seen":[["a",1]],"note":[0,"ok"]}

const wire: JSONShape<Reading> = JSON.parse(json!); // the type of the JSON above
// end-wire

export {json, wire};
