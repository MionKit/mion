/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// testing binary vs json performance

// Initialize encoders/decoders once
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// SeqProto-style optimized serializer
function createOptimizedSerializer(bufferSize = 2 ** 20) {
    // 1MB default
    const buffer = new ArrayBuffer(bufferSize);
    return {
        index: 0, // Index in 32-bit units (consistent with seqproto)
        buffer,
        uint32Array: new Uint32Array(buffer),
        float32Array: new Float32Array(buffer),
        reset() {
            this.index = 0;
        },
        getUsedBuffer() {
            return this.buffer.slice(0, this.index * 4);
        },
    };
}

// SeqProto-style optimized deserializer
function createOptimizedDeserializer(buffer) {
    const n32 = Math.floor(buffer.byteLength / 4);
    return {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer, 0, n32),
        float32Array: new Float32Array(buffer, 0, n32),
        setBuffer(newBuffer) {
            const n32 = Math.floor(newBuffer.byteLength / 4);
            this.buffer = newBuffer;
            this.index = 0;
            this.uint32Array = new Uint32Array(newBuffer, 0, n32);
            this.float32Array = new Float32Array(newBuffer, 0, n32);
        },
    };
}

// Binary encoding/decoding functions (original versions)
function encodeBinary(obj) {
    const nameBytes = textEncoder.encode(obj.name);
    const addressBytes = textEncoder.encode(obj.address);

    // Calculate total size: name_len(4) + name + age(8) + addr_len(4) + address
    const totalSize = 4 + nameBytes.length + 8 + 4 + addressBytes.length;

    // Create Uint8Array first (more efficient than creating ArrayBuffer separately)
    const uint8 = new Uint8Array(totalSize);
    const view = new DataView(uint8.buffer);

    let pos = 0;

    // Write name length and name
    view.setUint32(pos, nameBytes.length, true);
    pos += 4;
    uint8.set(nameBytes, pos);
    pos += nameBytes.length;

    // Write age
    view.setFloat64(pos, obj.age, true);
    pos += 8;

    // Write address length and address
    view.setUint32(pos, addressBytes.length, true);
    pos += 4;
    uint8.set(addressBytes, pos);

    return uint8;
}

function decodeBinary(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset);
    let pos = 0;

    // Read name
    const nameLength = view.getUint32(pos, true);
    pos += 4;
    const name = textDecoder.decode(buffer.subarray(pos, pos + nameLength));
    pos += nameLength;

    // Read age
    const age = view.getFloat64(pos, true);
    pos += 8;

    // Read address
    const addressLength = view.getUint32(pos, true);
    pos += 4;
    const address = textDecoder.decode(buffer.subarray(pos, pos + addressLength));

    return {name, age, address};
}

// Optimized binary encoding/decoding functions with reusable buffers
function encodeBinaryReusable(obj, encodeContext) {
    const nameBytes = textEncoder.encode(obj.name);
    const addressBytes = textEncoder.encode(obj.address);

    // Calculate total size: name_len(4) + name + age(8) + addr_len(4) + address
    const totalSize = 4 + nameBytes.length + 8 + 4 + addressBytes.length;

    let pos = 0;

    // Write name length and name
    encodeContext.view.setUint32(pos, nameBytes.length, true);
    pos += 4;
    encodeContext.uint8.set(nameBytes, pos);
    pos += nameBytes.length;

    // Write age
    encodeContext.view.setFloat64(pos, obj.age, true);
    pos += 8;

    // Write address length and address
    encodeContext.view.setUint32(pos, addressBytes.length, true);
    pos += 4;
    encodeContext.uint8.set(addressBytes, pos);

    // Update totalSize in context and return it for convenience
    encodeContext.totalSize = totalSize;
    return totalSize;
}

function decodeBinaryReusable(decodeContext) {
    let pos = 0;

    // Read name
    const nameLength = decodeContext.view.getUint32(pos, true);
    pos += 4;
    const name = textDecoder.decode(decodeContext.buffer.subarray(pos, pos + nameLength));
    pos += nameLength;

    // Read age
    const age = decodeContext.view.getFloat64(pos, true);
    pos += 8;

    // Read address
    const addressLength = decodeContext.view.getUint32(pos, true);
    pos += 4;
    const address = textDecoder.decode(decodeContext.buffer.subarray(pos, pos + addressLength));

    return {name, age, address};
}

// SeqProto-style optimized encoding function
function encodeOptimized(obj, serializer) {
    // Encode name string using encodeInto (zero allocation)
    const nameResult = textEncoder.encodeInto(obj.name, new Uint8Array(serializer.buffer, (serializer.index + 1) * 4));
    serializer.uint32Array[serializer.index] = nameResult.written; // Store length
    serializer.index += Math.ceil(nameResult.written / 4) + 1; // Advance by 32-bit chunks

    // Encode age as float32 (seqproto style)
    serializer.float32Array[serializer.index++] = obj.age;

    // Encode address string using encodeInto
    const addressResult = textEncoder.encodeInto(obj.address, new Uint8Array(serializer.buffer, (serializer.index + 1) * 4));
    serializer.uint32Array[serializer.index] = addressResult.written; // Store length
    serializer.index += Math.ceil(addressResult.written / 4) + 1; // Advance by 32-bit chunks
}

// SeqProto-style optimized decoding function
function decodeOptimized(deserializer) {
    // Decode name string
    const nameLength = deserializer.uint32Array[deserializer.index++];
    const name = textDecoder.decode(new Uint8Array(deserializer.buffer, deserializer.index * 4, nameLength));
    deserializer.index += Math.ceil(nameLength / 4);

    // Decode age as float32 (seqproto style)
    const age = deserializer.float32Array[deserializer.index++];

    // Decode address string
    const addressLength = deserializer.uint32Array[deserializer.index++];
    const address = textDecoder.decode(new Uint8Array(deserializer.buffer, deserializer.index * 4, addressLength));
    deserializer.index += Math.ceil(addressLength / 4);

    return {name, age, address};
}

// Benchmark function for single object
function benchmarkSingle() {
    const testObj = {name: 'John Doe', age: 30, address: '123 Main St'};
    const iterations = 1000000;
    const warmupIterations = 100000;

    console.log('\n=== SINGLE OBJECT BENCHMARK ===');
    console.log(
        '\nObject:',
        testObj,
        '\nJSON size:',
        JSON.stringify(testObj).length,
        'bytes',
        '\nBinary size:',
        encodeBinary(testObj).length,
        'bytes'
    );

    const results = {};

    // JSON stringify benchmark
    for (let i = 0; i < warmupIterations; i++) {
        JSON.stringify(testObj);
    }
    let start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.stringify(testObj);
    }
    let end = performance.now();
    results['JSON stringify'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // JSON parse benchmark
    const jsonStr = JSON.stringify(testObj);
    for (let i = 0; i < warmupIterations; i++) {
        JSON.parse(jsonStr);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.parse(jsonStr);
    }
    end = performance.now();
    results['JSON parse'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Binary encode benchmark
    for (let i = 0; i < warmupIterations; i++) {
        encodeBinary(testObj);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        encodeBinary(testObj);
    }
    end = performance.now();
    results['Binary encode'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Binary decode benchmark
    const binaryData = encodeBinary(testObj);
    for (let i = 0; i < warmupIterations; i++) {
        decodeBinary(binaryData);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        decodeBinary(binaryData);
    }
    end = performance.now();
    results['Binary decode'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Display results
    console.log('\n=== SINGLE OBJECT RESULTS ===');
    console.table(results);

    // Verify correctness
    const decoded = decodeBinary(encodeBinary(testObj));
    console.log('\nCorrectness check:', JSON.stringify(decoded) === JSON.stringify(testObj));
}

// Benchmark function for array of objects
function benchmarkArray() {
    const testArray = Array(50)
        .fill(0)
        .map((_, i) => ({
            name: `User ${i}`,
            age: 20 + (i % 50),
            address: `${100 + i} Main Street`,
        }));
    const iterations = 10000; // Reduced for larger data
    const warmupIterations = 1000;

    console.log('\n=== ARRAY BENCHMARK ===');
    console.log('\nArray length:', testArray.length, '\nJSON size:', JSON.stringify(testArray).length, 'bytes');

    // Calculate binary size by encoding each object with reusable buffer
    const uint8Enc = new Uint8Array(1024);
    const encodeContext = {
        uint8: uint8Enc,
        view: new DataView(uint8Enc.buffer),
        totalSize: 0,
    };

    let totalBinarySize = 0;
    for (const obj of testArray) {
        encodeBinaryReusable(obj, encodeContext);
        totalBinarySize += encodeContext.totalSize;
    }
    console.log('Binary size (concatenated):', totalBinarySize, 'bytes');

    const results = {};

    // JSON stringify benchmark
    for (let i = 0; i < warmupIterations; i++) {
        JSON.stringify(testArray);
    }
    let start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.stringify(testArray);
    }
    let end = performance.now();
    results['JSON stringify'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // JSON parse benchmark
    const jsonStr = JSON.stringify(testArray);
    for (let i = 0; i < warmupIterations; i++) {
        JSON.parse(jsonStr);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.parse(jsonStr);
    }
    end = performance.now();
    results['JSON parse'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Binary encode benchmark with reusable buffer (encode each object in array)
    // Reset context for benchmark
    encodeContext.uint8 = new Uint8Array(1024);
    encodeContext.view = new DataView(encodeContext.uint8.buffer);
    for (let i = 0; i < warmupIterations; i++) {
        for (const obj of testArray) {
            encodeBinaryReusable(obj, encodeContext);
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const obj of testArray) {
            encodeBinaryReusable(obj, encodeContext);
        }
    }
    end = performance.now();
    results['Binary encode (reusable)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Binary decode benchmark - properly concatenate all objects
    const objectSizes: number[] = [];
    let totalConcatenatedSize = 0;

    // First pass: calculate total size needed
    for (const obj of testArray) {
        encodeBinaryReusable(obj, encodeContext);
        objectSizes.push(encodeContext.totalSize);
        totalConcatenatedSize += encodeContext.totalSize;
    }

    // Create a properly sized buffer and concatenate all objects
    const concatenatedBuffer = new Uint8Array(totalConcatenatedSize);
    let writeOffset = 0;

    for (let i = 0; i < testArray.length; i++) {
        encodeBinaryReusable(testArray[i], encodeContext);
        const objectData = new Uint8Array(encodeContext.uint8.buffer, 0, encodeContext.totalSize);
        concatenatedBuffer.set(objectData, writeOffset);
        writeOffset += objectSizes[i];
    }

    // Create decode context for reuse
    const bufferDec = new Uint8Array(0);
    const decodeContext = {
        buffer: bufferDec,
        view: new DataView(bufferDec.buffer),
    };

    for (let i = 0; i < warmupIterations; i++) {
        let bufferOffset = 0;
        for (let j = 0; j < testArray.length; j++) {
            const objectSize = objectSizes[j];
            decodeContext.buffer = new Uint8Array(
                concatenatedBuffer.buffer,
                concatenatedBuffer.byteOffset + bufferOffset,
                objectSize
            );
            decodeContext.view = new DataView(
                concatenatedBuffer.buffer,
                concatenatedBuffer.byteOffset + bufferOffset,
                objectSize
            );
            decodeBinaryReusable(decodeContext);
            bufferOffset += objectSize;
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        let bufferOffset = 0;
        for (let j = 0; j < testArray.length; j++) {
            const objectSize = objectSizes[j];
            decodeContext.buffer = new Uint8Array(
                concatenatedBuffer.buffer,
                concatenatedBuffer.byteOffset + bufferOffset,
                objectSize
            );
            decodeContext.view = new DataView(
                concatenatedBuffer.buffer,
                concatenatedBuffer.byteOffset + bufferOffset,
                objectSize
            );
            decodeBinaryReusable(decodeContext);
            bufferOffset += objectSize;
        }
    }
    end = performance.now();
    results['Binary decode (reusable)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Display results
    console.log('\n=== ARRAY RESULTS ===');
    console.table(results);

    // Performance test complete - no correctness check needed
}

// Benchmark function with reusable buffers
function benchmarkReusable() {
    const testArray = Array(50)
        .fill(0)
        .map((_, i) => ({
            name: `User ${i}`,
            age: 20 + (i % 50),
            address: `${100 + i} Main Street`,
        }));
    const iterations = 10000; // Reduced for larger data
    const warmupIterations = 1000;

    console.log('\n=== REUSABLE BUFFERS BENCHMARK ===');
    console.log('\nArray length:', testArray.length, '\nJSON size:', JSON.stringify(testArray).length, 'bytes');

    // Calculate binary size by encoding each object
    let totalBinarySize = 0;
    for (const obj of testArray) {
        totalBinarySize += encodeBinary(obj).length;
    }
    console.log('Binary size (concatenated):', totalBinarySize, 'bytes');

    const results = {};

    // JSON stringify benchmark
    for (let i = 0; i < warmupIterations; i++) {
        JSON.stringify(testArray);
    }
    let start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.stringify(testArray);
    }
    let end = performance.now();
    results['JSON stringify'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // JSON parse benchmark
    const jsonStr = JSON.stringify(testArray);
    for (let i = 0; i < warmupIterations; i++) {
        JSON.parse(jsonStr);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.parse(jsonStr);
    }
    end = performance.now();
    results['JSON parse'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Pre-allocate reusable buffer (generous size)
    const encodeContextReusable = {
        uint8: new Uint8Array(1024),
        view: new DataView(new Uint8Array(1024).buffer),
        totalSize: 0,
    };
    encodeContextReusable.view = new DataView(encodeContextReusable.uint8.buffer);

    // Binary encode benchmark with reusable buffers (encode each object in array)
    for (let i = 0; i < warmupIterations; i++) {
        for (const obj of testArray) {
            encodeBinaryReusable(obj, encodeContextReusable);
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const obj of testArray) {
            encodeBinaryReusable(obj, encodeContextReusable);
        }
    }
    end = performance.now();
    results['Binary encode (reusable)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Binary decode benchmark with reusable buffers (decode each object)
    const binaryDataArray = testArray.map((obj) => {
        encodeBinaryReusable(obj, encodeContextReusable);
        return new Uint8Array(encodeContextReusable.uint8.buffer, 0, encodeContextReusable.totalSize);
    });

    // Create decode context for reuse
    const decodeContextReusable = {
        buffer: new Uint8Array(0),
        view: new DataView(new ArrayBuffer(0)),
    };

    for (let i = 0; i < warmupIterations; i++) {
        for (const binaryData of binaryDataArray) {
            decodeContextReusable.buffer = binaryData;
            decodeContextReusable.view = new DataView(binaryData.buffer, binaryData.byteOffset);
            decodeBinaryReusable(decodeContextReusable);
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const binaryData of binaryDataArray) {
            decodeContextReusable.buffer = binaryData;
            decodeContextReusable.view = new DataView(binaryData.buffer, binaryData.byteOffset);
            decodeBinaryReusable(decodeContextReusable);
        }
    }
    end = performance.now();
    results['Binary decode (reusable)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Display results
    console.log('\n=== REUSABLE BUFFERS RESULTS ===');
    console.table(results);
}

// SeqProto-style optimized benchmark
function benchmarkOptimized() {
    const testArray = Array(50)
        .fill(0)
        .map((_, i) => ({
            name: `User ${i}`,
            age: 20 + (i % 50),
            address: `${100 + i} Main Street`,
        }));
    const iterations = 10000;
    const warmupIterations = 1000;

    console.log('\n=== SEQPROTO-STYLE OPTIMIZED BENCHMARK ===');
    console.log('\nArray length:', testArray.length, '\nJSON size:', JSON.stringify(testArray).length, 'bytes');

    // Create reusable serializer and deserializer
    const serializer = createOptimizedSerializer();

    // Calculate optimized binary size
    serializer.reset();
    for (const obj of testArray) {
        encodeOptimized(obj, serializer);
    }
    const optimizedBuffer = serializer.getUsedBuffer();
    console.log('Optimized binary size:', optimizedBuffer.byteLength, 'bytes');

    const results = {};

    // JSON stringify benchmark
    for (let i = 0; i < warmupIterations; i++) {
        JSON.stringify(testArray);
    }
    let start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.stringify(testArray);
    }
    let end = performance.now();
    results['JSON stringify'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // JSON parse benchmark
    const jsonStr = JSON.stringify(testArray);
    for (let i = 0; i < warmupIterations; i++) {
        JSON.parse(jsonStr);
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.parse(jsonStr);
    }
    end = performance.now();
    results['JSON parse'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Optimized binary encode benchmark
    for (let i = 0; i < warmupIterations; i++) {
        serializer.reset();
        for (const obj of testArray) {
            encodeOptimized(obj, serializer);
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        serializer.reset();
        for (const obj of testArray) {
            encodeOptimized(obj, serializer);
        }
    }
    end = performance.now();
    results['Binary encode (optimized)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Optimized binary decode benchmark
    const deserializer = createOptimizedDeserializer(optimizedBuffer);
    for (let i = 0; i < warmupIterations; i++) {
        deserializer.index = 0;
        for (let j = 0; j < testArray.length; j++) {
            decodeOptimized(deserializer);
        }
    }
    start = performance.now();
    for (let i = 0; i < iterations; i++) {
        deserializer.index = 0;
        for (let j = 0; j < testArray.length; j++) {
            decodeOptimized(deserializer);
        }
    }
    end = performance.now();
    results['Binary decode (optimized)'] = {
        'Time (ms)': (end - start).toFixed(2),
        'Ops/sec': Math.round(iterations / ((end - start) / 1000)),
    };

    // Display results
    console.log('\n=== OPTIMIZED RESULTS ===');
    console.table(results);
}

it('benchmark single object', () => {
    benchmarkSingle();
});

it('benchmark array', () => {
    benchmarkArray();
});

it('benchmark reusable (array)', () => {
    benchmarkReusable();
});

it('benchmark optimized (seqproto-style)', () => {
    benchmarkOptimized();
});
