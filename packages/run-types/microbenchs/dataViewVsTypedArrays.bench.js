function getTestData() {
  // type TestInterface = {
  //     startDate: Date;
  //     quantity: number;
  //     name: string;
  //     nullValue: null;
  //     stringArray: string[];
  //     bigInt: bigint;
  //     "weird prop name \n?>'\\\t\r": string;
  //     optionalString?: string;
  // };

  // value type is TestInterface
  const value = {
    startDate: new Date('2000-08-06T02:13:00.000Z'),
    quantity: 123,
    name: 'hello',
    nullValue: null,
    stringArray: ['a', 'b', 'c'],
    bigInt: BigInt(123),
    "weird prop name \n?>'\\\t\r": 'hello2',
  };
  return value;
}

function validateRoundTrip(original, deserialized) {
  const errors = [];

  // Check startDate
  if (!(deserialized.startDate instanceof Date)) {
    errors.push(`startDate is not a Date: ${typeof deserialized.startDate}`);
  } else if (original.startDate.getTime() !== deserialized.startDate.getTime()) {
    errors.push(`startDate mismatch: ${original.startDate.getTime()} !== ${deserialized.startDate.getTime()}`);
  }

  // Check quantity
  if (typeof deserialized.quantity !== 'number') {
    errors.push(`quantity is not a number: ${typeof deserialized.quantity}`);
  } else if (original.quantity !== deserialized.quantity) {
    errors.push(`quantity mismatch: ${original.quantity} !== ${deserialized.quantity}`);
  }

  // Check name
  if (typeof deserialized.name !== 'string') {
    errors.push(`name is not a string: ${typeof deserialized.name}`);
  } else if (original.name !== deserialized.name) {
    errors.push(`name mismatch: "${original.name}" !== "${deserialized.name}"`);
  }

  // Check nullValue
  if (deserialized.nullValue !== null) {
    errors.push(`nullValue is not null: ${deserialized.nullValue}`);
  }

  // Check stringArray
  if (!Array.isArray(deserialized.stringArray)) {
    errors.push(`stringArray is not an array: ${typeof deserialized.stringArray}`);
  } else if (original.stringArray.length !== deserialized.stringArray.length) {
    errors.push(`stringArray length mismatch: ${original.stringArray.length} !== ${deserialized.stringArray.length}`);
  } else {
    for (let i = 0; i < original.stringArray.length; i++) {
      if (original.stringArray[i] !== deserialized.stringArray[i]) {
        errors.push(`stringArray[${i}] mismatch: "${original.stringArray[i]}" !== "${deserialized.stringArray[i]}"`);
      }
    }
  }

  // Check bigInt
  if (typeof deserialized.bigInt !== 'bigint') {
    errors.push(`bigInt is not a bigint: ${typeof deserialized.bigInt}`);
  } else if (original.bigInt !== deserialized.bigInt) {
    errors.push(`bigInt mismatch: ${original.bigInt} !== ${deserialized.bigInt}`);
  }

  // Check weird prop name
  const weirdProp = "weird prop name \n?>'\\\t\r";
  if (typeof deserialized[weirdProp] !== 'string') {
    errors.push(`weird prop is not a string: ${typeof deserialized[weirdProp]}`);
  } else if (original[weirdProp] !== deserialized[weirdProp]) {
    errors.push(`weird prop mismatch: "${original[weirdProp]}" !== "${deserialized[weirdProp]}"`);
  }

  return errors;
}

// ============================================================================
// METHOD 1: DataView Approach
// ============================================================================

function serializeWithDataView(value, buffer, dataView, textEncoder) {
  let offset = 0;

  // startDate (Date -> timestamp as Float64)
  dataView.setFloat64(offset, value.startDate.getTime(), true);
  offset += 8;

  // quantity (number as Float64)
  dataView.setFloat64(offset, value.quantity, true);
  offset += 8;

  // name (string)
  const nameBytes = textEncoder.encode(value.name);
  dataView.setUint32(offset, nameBytes.length, true);
  offset += 4;
  new Uint8Array(buffer, offset, nameBytes.length).set(nameBytes);
  offset += nameBytes.length;

  // nullValue (null - single byte)
  dataView.setUint8(offset, 1); // marker for null
  offset += 1;

  // stringArray (array of strings)
  dataView.setUint32(offset, value.stringArray.length, true);
  offset += 4;
  for (const str of value.stringArray) {
    const strBytes = textEncoder.encode(str);
    dataView.setUint32(offset, strBytes.length, true);
    offset += 4;
    new Uint8Array(buffer, offset, strBytes.length).set(strBytes);
    offset += strBytes.length;
  }

  // bigInt (BigInt as two Uint32 values for high and low parts)
  const bigIntValue = value.bigInt;
  const high = Number(bigIntValue >> BigInt(32)) & 0xffffffff;
  const low = Number(bigIntValue & BigInt(0xffffffff)) >>> 0;
  dataView.setUint32(offset, high, true);
  offset += 4;
  dataView.setUint32(offset, low, true);
  offset += 4;

  // weird prop name
  const weirdBytes = textEncoder.encode(value["weird prop name \n?>'\\\t\r"]);
  dataView.setUint32(offset, weirdBytes.length, true);
  offset += 4;
  new Uint8Array(buffer, offset, weirdBytes.length).set(weirdBytes);
  offset += weirdBytes.length;

  return offset;
}

function deserializeWithDataView(buffer, dataView, textDecoder) {
  let offset = 0;

  // startDate
  const timestamp = dataView.getFloat64(offset, true);
  offset += 8;
  const startDate = new Date(timestamp);

  // quantity
  const quantity = dataView.getFloat64(offset, true);
  offset += 8;

  // name (hardcoded length: 5 bytes for 'hello')
  void dataView.getUint32(offset, true); // read length
  offset += 4;
  const nameBytes = new Uint8Array(buffer, offset, 5);
  const name = textDecoder.decode(nameBytes);
  offset += 5;

  // nullValue (single byte)
  void dataView.getUint8(offset); // read null marker
  offset += 1;
  const nullValue = null;

  // stringArray
  void dataView.getUint32(offset, true); // read array length
  offset += 4;
  const stringArray = [];
  // Hardcoded: array has 3 elements, each 1 byte ('a', 'b', 'c')
  for (let i = 0; i < 3; i++) {
    void dataView.getUint32(offset, true); // read string length
    offset += 4;
    const strBytes = new Uint8Array(buffer, offset, 1);
    stringArray.push(textDecoder.decode(strBytes));
    offset += 1;
  }

  // bigInt
  const high = dataView.getUint32(offset, true);
  offset += 4;
  const low = dataView.getUint32(offset, true);
  offset += 4;
  const bigInt = (BigInt(high) << BigInt(32)) | BigInt(low >>> 0);

  // weird prop name (hardcoded length: 6 bytes for 'hello2')
  void dataView.getUint32(offset, true); // read length
  offset += 4;
  const weirdBytes = new Uint8Array(buffer, offset, 6);
  const weirdValue = textDecoder.decode(weirdBytes);
  offset += 6;

  return {
    startDate,
    quantity,
    name,
    nullValue,
    stringArray,
    bigInt,
    "weird prop name \n?>'\\\t\r": weirdValue,
  };
}

// ============================================================================
// METHOD 2: TypedArrays Approach
// ============================================================================

function serializeWithTypedArrays(value, uint32Array, float64Array, uint8Array, textEncoder) {
  let offset = 0;

  // startDate (Date -> timestamp as Float64)
  float64Array[offset / 8] = value.startDate.getTime();
  offset += 8;

  // quantity (number as Float64)
  float64Array[offset / 8] = value.quantity;
  offset += 8;

  // name (string)
  const nameBytes = textEncoder.encode(value.name);
  uint32Array[offset / 4] = nameBytes.length;
  offset += 4;
  uint8Array.set(nameBytes, offset);
  offset += nameBytes.length;
  // Align to 4-byte boundary
  offset = Math.ceil(offset / 4) * 4;

  // nullValue (null - padded to 32 bits)
  uint32Array[offset / 4] = 1;
  offset += 4;

  // stringArray
  uint32Array[offset / 4] = value.stringArray.length;
  offset += 4;
  for (const str of value.stringArray) {
    const strBytes = textEncoder.encode(str);
    uint32Array[offset / 4] = strBytes.length;
    offset += 4;
    uint8Array.set(strBytes, offset);
    offset += strBytes.length;
    // Align to 4-byte boundary
    offset = Math.ceil(offset / 4) * 4;
  }

  // bigInt
  const bigIntValue = value.bigInt;
  const high = Number(bigIntValue >> BigInt(32)) & 0xffffffff;
  const low = Number(bigIntValue & BigInt(0xffffffff)) >>> 0;
  uint32Array[offset / 4] = high;
  offset += 4;
  uint32Array[offset / 4] = low;
  offset += 4;

  // weird prop name
  const weirdBytes = textEncoder.encode(value["weird prop name \n?>'\\\t\r"]);
  uint32Array[offset / 4] = weirdBytes.length;
  offset += 4;
  uint8Array.set(weirdBytes, offset);
  offset += weirdBytes.length;
  // Align to 4-byte boundary
  offset = Math.ceil(offset / 4) * 4;

  return offset;
}

function deserializeWithTypedArrays(uint32Array, float64Array, uint8Array, textDecoder) {
  let offset = 0;

  // startDate
  const timestamp = float64Array[offset / 8];
  offset += 8;
  const startDate = new Date(timestamp);

  // quantity
  const quantity = float64Array[offset / 8];
  offset += 8;

  // name
  const nameLength = uint32Array[offset / 4];
  offset += 4;
  const name = textDecoder.decode(uint8Array.slice(offset, offset + nameLength));
  offset += nameLength;
  // Align to 4-byte boundary
  offset = Math.ceil(offset / 4) * 4;

  // nullValue
  void uint32Array[offset / 4]; // read null marker
  offset += 4;
  const nullValue = null;

  // stringArray
  const arrayLength = uint32Array[offset / 4];
  offset += 4;
  const stringArray = [];
  for (let i = 0; i < arrayLength; i++) {
    const strLength = uint32Array[offset / 4];
    offset += 4;
    stringArray.push(textDecoder.decode(uint8Array.slice(offset, offset + strLength)));
    offset += strLength;
    // Align to 4-byte boundary
    offset = Math.ceil(offset / 4) * 4;
  }

  // bigInt
  const high = uint32Array[offset / 4];
  offset += 4;
  const low = uint32Array[offset / 4];
  offset += 4;
  const bigInt = (BigInt(high) << BigInt(32)) | BigInt(low >>> 0);

  // weird prop name
  const weirdLength = uint32Array[offset / 4];
  offset += 4;
  const weirdValue = textDecoder.decode(uint8Array.slice(offset, offset + weirdLength));
  offset += weirdLength;
  // Align to 4-byte boundary
  offset = Math.ceil(offset / 4) * 4;

  return {
    startDate,
    quantity,
    name,
    nullValue,
    stringArray,
    bigInt,
    "weird prop name \n?>'\\\t\r": weirdValue,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

function runValidation() {
  // eslint-disable-next-line no-undef
  const textEncoder = new TextEncoder();
  // eslint-disable-next-line no-undef
  const textDecoder = new TextDecoder();

  const testData = getTestData();

  // Test DataView approach
  const bufferSize = 4096;
  const buffer1 = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer1);
  const dataViewBytesUsed = serializeWithDataView(testData, buffer1, dataView, textEncoder);
  const deserializedDataView = deserializeWithDataView(buffer1, dataView, textDecoder);
  const dataViewErrors = validateRoundTrip(testData, deserializedDataView);

  // Test TypedArrays approach
  const buffer2 = new ArrayBuffer(bufferSize);
  const uint32Array = new Uint32Array(buffer2);
  const float64Array = new Float64Array(buffer2);
  const uint8Array = new Uint8Array(buffer2);
  const typedArraysBytesUsed = serializeWithTypedArrays(testData, uint32Array, float64Array, uint8Array, textEncoder);
  const deserializedTypedArrays = deserializeWithTypedArrays(uint32Array, float64Array, uint8Array, textDecoder);
  const typedArraysErrors = validateRoundTrip(testData, deserializedTypedArrays);

  // Report results
  // eslint-disable-next-line no-undef
  console.log('\n=== Validation Results ===');
  if (dataViewErrors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log(`✓ DataView approach: PASSED (${dataViewBytesUsed} bytes)`);
  } else {
    // eslint-disable-next-line no-undef
    console.log(`✗ DataView approach: FAILED (${dataViewBytesUsed} bytes)`);
    dataViewErrors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  if (typedArraysErrors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log(`✓ TypedArrays approach: PASSED (${typedArraysBytesUsed} bytes)`);
  } else {
    // eslint-disable-next-line no-undef
    console.log(`✗ TypedArrays approach: FAILED (${typedArraysBytesUsed} bytes)`);
    typedArraysErrors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  // Show byte length comparison
  // eslint-disable-next-line no-undef
  console.log(`\nByte length comparison:`);
  // eslint-disable-next-line no-undef
  console.log(`  DataView:   ${dataViewBytesUsed} bytes`);
  // eslint-disable-next-line no-undef
  console.log(`  TypedArrays: ${typedArraysBytesUsed} bytes`);
  if (dataViewBytesUsed === typedArraysBytesUsed) {
    // eslint-disable-next-line no-undef
    console.log(`  Difference: 0 bytes (identical)`);
  } else {
    const diff = Math.abs(dataViewBytesUsed - typedArraysBytesUsed);
    const percentage = ((diff / Math.max(dataViewBytesUsed, typedArraysBytesUsed)) * 100).toFixed(1);
    // eslint-disable-next-line no-undef
    console.log(`  Difference: ${diff} bytes (${percentage}%)`);
  }

  return dataViewErrors.length === 0 && typedArraysErrors.length === 0;
}

// ============================================================================
// BENCHMARK
// ============================================================================

function runBenchmark() {
  const testData = getTestData();
  const iterations = 1_000_000;

  // Buffer setup (done outside of benchmark)
  const bufferSize = 4096;
  const buffer1 = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer1);
  // eslint-disable-next-line no-undef
  const textEncoder = new TextEncoder();
  // eslint-disable-next-line no-undef
  const textDecoder = new TextDecoder();

  const buffer2 = new ArrayBuffer(bufferSize);
  const uint32Array = new Uint32Array(buffer2);
  const float64Array = new Float64Array(buffer2);
  const uint8Array = new Uint8Array(buffer2);

  // Warm up
  for (let i = 0; i < 5000; i++) {
    serializeWithDataView(testData, buffer1, dataView, textEncoder);
    deserializeWithDataView(buffer1, dataView, textDecoder);
    serializeWithTypedArrays(testData, uint32Array, float64Array, uint8Array, textEncoder);
    deserializeWithTypedArrays(uint32Array, float64Array, uint8Array, textDecoder);
  }

  // Benchmark Method 1: DataView
  // eslint-disable-next-line no-undef
  const dataViewStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    serializeWithDataView(testData, buffer1, dataView, textEncoder);
    deserializeWithDataView(buffer1, dataView, textDecoder);
  }
  // eslint-disable-next-line no-undef
  const dataViewEnd = performance.now();
  const dataViewTime = dataViewEnd - dataViewStart;

  // Benchmark Method 2: TypedArrays
  // eslint-disable-next-line no-undef
  const typedArraysStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    serializeWithTypedArrays(testData, uint32Array, float64Array, uint8Array, textEncoder);
    deserializeWithTypedArrays(uint32Array, float64Array, uint8Array, textDecoder);
  }
  // eslint-disable-next-line no-undef
  const typedArraysEnd = performance.now();
  const typedArraysTime = typedArraysEnd - typedArraysStart;

  // Results
  // eslint-disable-next-line no-undef
  console.log('\n=== DataView vs TypedArrays Benchmark ===');
  // eslint-disable-next-line no-undef
  console.log(`Iterations: ${iterations.toLocaleString()}`);
  // eslint-disable-next-line no-undef
  console.log(`\nMethod 1 (DataView):`);
  // eslint-disable-next-line no-undef
  console.log(`  Total time: ${dataViewTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`  Per iteration: ${(dataViewTime / iterations).toFixed(4)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`\nMethod 2 (TypedArrays):`);
  // eslint-disable-next-line no-undef
  console.log(`  Total time: ${typedArraysTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`  Per iteration: ${(typedArraysTime / iterations).toFixed(4)}ms`);

  const faster = dataViewTime < typedArraysTime ? 'DataView' : 'TypedArrays';
  const percentage = Math.abs(((dataViewTime - typedArraysTime) / Math.max(dataViewTime, typedArraysTime)) * 100).toFixed(1);
  // eslint-disable-next-line no-undef
  console.log(`\n${faster} is ${percentage}% faster`);
}

// Run validation first, then benchmark
const validationPassed = runValidation();
if (validationPassed) {
  runBenchmark();
} else {
  // eslint-disable-next-line no-undef
  console.log('\n⚠ Validation failed. Skipping benchmark.');
}
