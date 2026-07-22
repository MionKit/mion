import {createJsonEncoder, createJsonDecoder} from '@ts-runtypes/core';

type Result = string | number | {error: string};

// createJsonEncoder / createJsonDecoder are the public JSON serialization API.
// The encoder walks the type of `Result` and produces a JSON string; the decoder
// parses it back to the correct union member.
const encode = createJsonEncoder<Result>();
const decode = createJsonDecoder<Result>();

// String member
const json1 = encode('hello');
const back1 = decode(json1!); // 'hello'

// Number member
const json2 = encode(42);
const back2 = decode(json2!); // 42

// Object member
const json3 = encode({error: 'not found'});
const back3 = decode(json3!); // {error: 'not found'}
