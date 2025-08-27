/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Examples demonstrating three different approaches to BSON serialization:
 * 1. JIT-generated code (production approach)
 * 2. Class-based utilities (reference implementation)
 * 3. Pure functional approach (alternative reference)
 */

import {runType} from '../lib/runType';
import {JitFunctions} from '../constants.functions';
import {BSONWriter, BSONReader} from './bsonUtils';
import * as PureBSON from './bsonPureFunctions';

/**
 * Example 1: JIT-generated BSON serialization (PRODUCTION APPROACH)
 * This is the main approach used in the mion framework
 */
export function exampleJITSerialization() {
    console.log('=== JIT-Generated BSON Serialization ===');

    // Create a runType for a string
    const rt = runType<string>();
    const toBSON = rt.createJitFunction(JitFunctions.toBSON);

    // Serialize using JIT-generated code
    const result = toBSON('Hello, World!');

    console.log(
        'JIT Result:',
        Array.from(result)
            .map((b) => '0x' + b.toString(16).padStart(2, '0'))
            .join(' ')
    );
    console.log('JIT Result length:', result.length);

    return result;
}

/**
 * Example 2: Class-based BSON utilities (REFERENCE IMPLEMENTATION)
 * This is for reference and understanding the BSON format
 */
export function exampleClassBasedSerialization() {
    console.log('\n=== Class-based BSON Serialization ===');

    const writer = new BSONWriter();

    // Write BSON string type and data
    writer.writeUInt8(0x02); // BSON string type
    writer.writeString('Hello, World!');

    const result = writer.getBuffer();

    console.log(
        'Class Result:',
        Array.from(result)
            .map((b) => '0x' + b.toString(16).padStart(2, '0'))
            .join(' ')
    );
    console.log('Class Result length:', result.length);

    // Read it back
    const reader = new BSONReader(result);
    const type = reader.readUInt8();
    const value = reader.readString();

    console.log('Read back - Type:', '0x' + type.toString(16).padStart(2, '0'));
    console.log('Read back - Value:', value);

    return result;
}

/**
 * Example 3: Pure functional BSON utilities (ALTERNATIVE REFERENCE)
 * This shows a functional programming approach with immutable state
 */
export function examplePureFunctionalSerialization() {
    console.log('\n=== Pure Functional BSON Serialization ===');

    let ctx = PureBSON.createBSONContext();

    // Write BSON string type and data
    let result = PureBSON.writeUInt8(ctx, 0x02); // BSON string type
    ctx = result.context;

    result = PureBSON.writeBSONString(ctx, 'Hello, World!');
    ctx = result.context;

    const buffer = PureBSON.getBuffer(ctx);

    console.log(
        'Pure Result:',
        Array.from(buffer)
            .map((b) => '0x' + b.toString(16).padStart(2, '0'))
            .join(' ')
    );
    console.log('Pure Result length:', buffer.length);

    // Read it back
    let readCtx: PureBSON.BSONContext = {buffer, position: 0};

    const readResult = PureBSON.readUInt8(readCtx);
    const type = readResult.value;
    readCtx = readResult.context;

    const stringResult = PureBSON.readBSONString(readCtx);
    const value = stringResult.value;

    console.log('Read back - Type:', '0x' + type.toString(16).padStart(2, '0'));
    console.log('Read back - Value:', value);

    return buffer;
}

/**
 * Compare all three approaches
 */
export function compareApproaches() {
    console.log('=== BSON Serialization Approach Comparison ===\n');

    const jitResult = exampleJITSerialization();
    const classResult = exampleClassBasedSerialization();
    const pureResult = examplePureFunctionalSerialization();

    console.log('\n=== Comparison ===');
    console.log('JIT and Class results match:', Array.from(jitResult).join(',') === Array.from(classResult).join(','));
    console.log('JIT and Pure results match:', Array.from(jitResult).join(',') === Array.from(pureResult).join(','));
    console.log(
        'All three approaches produce identical output:',
        Array.from(jitResult).join(',') === Array.from(classResult).join(',') &&
            Array.from(classResult).join(',') === Array.from(pureResult).join(',')
    );

    console.log('\n=== Performance Characteristics ===');
    console.log('1. JIT-generated: Fastest at runtime, optimized for each type');
    console.log('2. Class-based: Good for general use, object-oriented approach');
    console.log('3. Pure functional: Immutable, functional programming style');

    console.log('\n=== Use Cases ===');
    console.log('1. JIT-generated: Production serialization in mion framework');
    console.log('2. Class-based: Reference implementation, debugging, learning');
    console.log('3. Pure functional: Functional programming contexts, immutable data flows');
}

/**
 * Demonstrate complex data serialization with all approaches
 */
export function exampleComplexData() {
    console.log('\n=== Complex Data Example ===');

    // Example: Serialize multiple values
    const data = {
        name: 'John Doe',
        age: 30,
        active: true,
        score: 95.5,
        id: BigInt('12345678901234567890'),
    };

    console.log('Original data:', data);

    // Class-based approach for complex data
    const writer = new BSONWriter();

    // Write as BSON document-like structure
    writer.writeUInt8(0x02); // string
    writer.writeString(data.name);

    writer.writeUInt8(0x10); // int32
    writer.writeInt32LE(data.age);

    writer.writeUInt8(0x08); // boolean
    writer.writeUInt8(data.active ? 1 : 0);

    writer.writeUInt8(0x01); // double
    writer.writeDoubleLE(data.score);

    writer.writeUInt8(0x12); // int64
    writer.writeInt64LE(data.id);

    const complexResult = writer.getBuffer();
    console.log('Complex serialization length:', complexResult.length, 'bytes');

    // Read it back to verify
    const reader = new BSONReader(complexResult);

    const nameType = reader.readUInt8();
    const name = reader.readString();

    const ageType = reader.readUInt8();
    const age = reader.readInt32LE();

    const activeType = reader.readUInt8();
    const active = reader.readUInt8() === 1;

    const scoreType = reader.readUInt8();
    const score = reader.readDoubleLE();

    const idType = reader.readUInt8();
    const id = reader.readInt64LE();

    console.log('Deserialized data:', {name, age, active, score, id});
    console.log('Types:', {
        nameType: '0x' + nameType.toString(16),
        ageType: '0x' + ageType.toString(16),
        activeType: '0x' + activeType.toString(16),
        scoreType: '0x' + scoreType.toString(16),
        idType: '0x' + idType.toString(16),
    });
}

// Uncomment to run examples:
// compareApproaches();
// exampleComplexData();
