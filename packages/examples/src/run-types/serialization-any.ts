import {createBinaryEncoder, createBinaryDecoder} from '@mionjs/run-types';

type FlexibleData = {
    id: number;
    payload: any; // Can contain any JSON-compatible value
};

const toBinary = createBinaryEncoder<FlexibleData>();
const fromBinary = createBinaryDecoder<FlexibleData>();

const data: FlexibleData = {
    id: 1,
    payload: {nested: {deeply: [1, 2, 3]}, flag: true},
};

const binary = toBinary(data);
const restored = fromBinary(binary);
// restored.payload is parsed back from JSON
