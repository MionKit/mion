import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

// a function the client calls over the network
function scheduleOrder(
  total: bigint,
  deliverOn: Date,
  tags: Set<string>
): Map<string, Date> {
  return new Map([[`${total}-${[...tags].join()}`, deliverOn]]);
}
type Params = Parameters<typeof scheduleOrder>;
type Result = ReturnType<typeof scheduleOrder>;

// client: encode the params
const encodeParams = createJsonEncoderFn<Params>();
const body = encodeParams([
  4999n,
  new Date('2024-05-01T00:00:00.000Z'),
  new Set(['gift']),
]) as string;
// '["4999","2024-05-01T00:00:00.000Z",["gift"]]'

// server: decode the params, same values as sent
const decodeParams = createJsonDecoderFn<Params>();
const [total, deliverOn, tags] = decodeParams(body); // bigint, Date, Set<string>
const result = scheduleOrder(total, deliverOn, tags);

// the return value makes the same trip back
const encodeResult = createJsonEncoderFn<Result>();
const decodeResult = createJsonDecoderFn<Result>();
const received = decodeResult(encodeResult(result) as string); // Map<string, Date>

export {received};
